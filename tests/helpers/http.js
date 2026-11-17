'use strict';

// Objetos req/res falsos para probar controladores y middlewares de forma aislada
const crearRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.location = jest.fn(() => res);
  res.setHeader = jest.fn();
  res.headersSent = false;
  return res;
};

const crearReq = (datos = {}) => ({
  body: {}, params: {}, query: {}, headers: {}, ...datos,
});

module.exports = { crearReq, crearRes };
