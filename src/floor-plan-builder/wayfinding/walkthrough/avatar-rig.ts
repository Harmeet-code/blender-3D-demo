import { Quaternion, Vector3, type Group } from 'three';
import type { Follower } from './follower.ts';
import { sampleLeg, type Vec3 } from './path.ts';
import { pointInPolygon } from '@/utils/geometry/polygon.ts';

interface Foot {
  anchor: Vector3;
  local: Vector3;
  stance: boolean;
}
/** Distance-driven gait. During stance the world-space foot anchor does not move. */
export class AvatarRig {
  private feet: Foot[] = [
    { anchor: new Vector3(), local: new Vector3(), stance: false },
    { anchor: new Vector3(), local: new Vector3(), stance: false },
  ];
  private down = new Vector3(0, -1, 0);
  private target = new Vector3();
  private direction = new Vector3();
  private bend = new Vector3();
  private kneePoint = new Vector3();
  private inverse = new Quaternion();
  private chain = new Quaternion();
  private legs: { hip: Group; knee: Group; ankle: Group }[] = [];
  private arms: Group[] = [];
  private torso: Group | null = null;
  private version = -1;
  private ground: Vec3 = [0, 0, 0];
  private slope: Vec3 = [0, 0, 0];
  private groundPoint: [number, number] = [0, 0];
  bind(root: Group) {
    this.version = -1;
    this.feet.forEach((foot) => {
      foot.stance = false;
    });
    this.legs = [];
    this.arms = [];
    for (const side of [-1, 1]) {
      const hip = root.getObjectByName(`WalkHip${side}`) as Group | undefined,
        knee = root.getObjectByName(`WalkKnee${side}`) as Group | undefined,
        ankle = root.getObjectByName(`WalkAnkle${side}`) as Group | undefined;
      if (hip && knee && ankle) {
        this.legs.push({ hip, knee, ankle });
      }
      const arm = root.getObjectByName(`WalkArm${side}`) as Group | undefined;
      if (arm) {
        this.arms.push(arm);
      }
    }
    this.torso = root.getObjectByName('WalkTorso') as Group | null;
  }
  update(frame: Follower, originY: number) {
    const walking =
      frame.speed > 0.02 && !frame.arrived && frame.path.legs[frame.leg]?.kind !== 'escalator';
    const stairs = frame.path.legs[frame.leg]?.kind === 'stairs';
    const stride = stairs ? 0.48 : 0.96;
    const phase = frame.gaitDistance / stride;
    const bob = walking ? 0.012 * (1 - Math.cos(phase * 4 * Math.PI)) : 0;
    let pelvis = (stairs ? 0.68 : 0.73) + bob;
    const cos = Math.cos(frame.yaw),
      sin = Math.sin(frame.yaw);
    this.feet.forEach((foot, index) => {
      const side = index ? 1 : -1,
        p = (phase + index * 0.5) % 1,
        stance = walking && p < 0.6;
      if (stance && (!foot.stance || this.version !== frame.seekVersion)) {
        const ahead = stride * 0.3;
        const leg = frame.path.legs[frame.leg]!;
        sampleLeg(leg, Math.min(leg.length, frame.s + ahead), this.ground, this.slope);
        let [, groundY] = this.ground;
        if (leg.kind === 'elevator') {
          groundY = Math.min(groundY, frame.position[1] + 0.06);
        }
        this.groundPoint[0] = frame.position[0] + cos * side * 0.1 - sin * ahead;
        this.groundPoint[1] = frame.position[2] - sin * side * 0.1 - cos * ahead;
        const tread = leg.treads.find((surface) =>
          pointInPolygon(this.groundPoint, surface.polygon),
        );
        if (tread) {
          groundY = tread.y;
        }
        foot.anchor.set(
          frame.position[0] + cos * side * 0.1 - sin * ahead,
          groundY + 0.03 + originY,
          frame.position[2] - sin * side * 0.1 - cos * ahead,
        );
      }
      foot.stance = stance;
      let x = side * 0.1,
        y = 0.03,
        z = 0;
      if (stance) {
        const dx = foot.anchor.x - frame.position[0],
          dz = foot.anchor.z - frame.position[2];
        x = cos * dx - sin * dz;
        z = sin * dx + cos * dz;
        y = foot.anchor.y - frame.position[1] - originY;
      } else if (walking) {
        const swing = Math.max(0, (p - 0.6) / 0.4);
        z = stride * (0.3 - 0.6 * swing);
        y += Math.sin(swing * Math.PI) * (stairs ? 0.24 : 0.13);
      }
      foot.local.set(x - side * 0.1, y, z);
      if (stance) {
        // Keep the pelvis inside both stance legs' reachable spheres. Clamping the IK
        // chain alone would move an apparently planted foot when crossing a step edge.
        const horizontalSq = foot.local.x ** 2 + z ** 2;
        pelvis = Math.min(pelvis, y + Math.sqrt(Math.max(0, 0.778 ** 2 - horizontalSq)));
      }
    });
    if (this.torso) {
      this.torso.position.y = pelvis - 0.77;
      this.torso.rotation.x =
        frame.path.legs[frame.leg]?.kind === 'ramp'
          ? Math.max(-0.1, Math.min(0.1, -frame.tangent[1] * 0.2))
          : 0;
    }
    this.legs.forEach((rig, index) => {
      rig.hip.position.y = pelvis;
      this.target.copy(this.feet[index]!.local);
      this.target.y -= pelvis;
      const length = Math.max(0.08, Math.min(0.779, this.target.length())),
        bone = 0.39;
      this.direction.copy(this.target).normalize();
      this.bend.set(0, 0, -1).addScaledVector(this.direction, this.direction.z);
      if (this.bend.lengthSq() < 1e-5) {
        this.bend.set(0, 1, 0);
      }
      this.bend.normalize();
      this.kneePoint
        .copy(this.direction)
        .multiplyScalar(length / 2)
        .addScaledVector(this.bend, Math.sqrt(Math.max(0, bone * bone - (length * length) / 4)));
      this.target.copy(this.kneePoint).normalize();
      rig.hip.quaternion.setFromUnitVectors(this.down, this.target);
      this.target.copy(this.direction).multiplyScalar(length).sub(this.kneePoint).normalize();
      this.inverse.copy(rig.hip.quaternion).invert();
      this.target.applyQuaternion(this.inverse);
      rig.knee.quaternion.setFromUnitVectors(this.down, this.target);
      this.chain.copy(rig.hip.quaternion).multiply(rig.knee.quaternion).invert();
      rig.ankle.quaternion.copy(this.chain);
    });
    this.arms.forEach((arm, index) => {
      arm.rotation.x = walking ? Math.sin((phase + index * 0.5) * 2 * Math.PI) * 0.35 : 0.04;
      if (frame.arrived && frame.arrivalTime < 1.1 && index === 1) {
        const wave = Math.sin((Math.PI * frame.arrivalTime) / 1.1);
        arm.rotation.x = 0.04 - 1.44 * wave;
        arm.rotation.z = -0.06 + wave * (-0.54 + Math.sin(frame.arrivalTime * 18) * 0.2);
      } else {
        arm.rotation.z = index ? -0.06 : 0.06;
      }
    });
    this.version = frame.seekVersion;
  }
}
