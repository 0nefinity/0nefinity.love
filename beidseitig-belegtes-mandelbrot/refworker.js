importScripts("chain.js");

// Reference orbits in BigInt take up to a second; here they keep the page responsive.
self.onmessage = (e) => {
  const { id, cr, ci, P, maxiter } = e.data;
  const ref = referenceOrbit(cr, ci, P, maxiter);
  self.postMessage({ id, ...ref }, [ref.Zr.buffer, ref.Zi.buffer]);
};
