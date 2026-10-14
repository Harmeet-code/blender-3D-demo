/** Nonblocking diagnostic queries. Disjoint/context-loss samples are discarded. */
export class GpuTimer {
  private extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery[] = [];
  private current: WebGLQuery | null = null;
  constructor(private context: WebGL2RenderingContext) {
    this.extension = context.getExtension('EXT_disjoint_timer_query_webgl2');
  }
  begin() {
    const gl = this.context;
    if (!this.extension || gl.isContextLost() || this.pending.length >= 4) {
      return;
    }
    this.current = gl.createQuery();
    if (this.current) {
      gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.current);
    }
  }
  end() {
    if (!this.current || !this.extension) {
      return;
    }
    this.context.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.current);
    this.current = null;
  }
  poll(): number[] {
    const gl = this.context,
      ext = this.extension;
    if (!ext || gl.isContextLost()) {
      this.pending.length = 0;
      return [];
    }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      this.dispose();
      return [];
    }
    const samples: number[] = [];
    while (
      this.pending.length &&
      gl.getQueryParameter(this.pending[0]!, gl.QUERY_RESULT_AVAILABLE)
    ) {
      const query = this.pending.shift()!;
      samples.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6);
      gl.deleteQuery(query);
    }
    return samples;
  }
  get supported() {
    return !!this.extension;
  }
  dispose() {
    this.pending.forEach((query) => this.context.deleteQuery(query));
    this.pending.length = 0;
    if (this.current) {
      this.context.deleteQuery(this.current);
      this.current = null;
    }
  }
}
