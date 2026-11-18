class Aufnehmer extends AudioWorkletProcessor {
  process(inputs) {
    const kanaele = inputs[0];
    if (!kanaele || !kanaele.length) return true;
    const n = kanaele[0].length;
    const aus = new Float32Array(n);
    for (let c = 0; c < kanaele.length; c++) {
      const k = kanaele[c];
      for (let i = 0; i < n; i++) aus[i] += k[i] / kanaele.length;
    }
    this.port.postMessage(aus, [aus.buffer]);
    return true;
  }
}
registerProcessor('mic-aufnehmer', Aufnehmer);
