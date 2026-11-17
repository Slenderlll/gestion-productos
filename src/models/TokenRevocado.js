'use strict';

const mongoose = require('mongoose');

// Lista de tokens cerrados con "Cerrar sesión". Un JWT es válido hasta que expira,
// así que al cerrar sesión se guarda su identificador (jti) aquí y el middleware de
// autenticación lo rechaza. El índice TTL borra cada registro cuando el token habría
// expirado de todos modos, así la colección no crece sin límite.
const tokenRevocadoSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  expiraEn: { type: Date, required: true, expires: 0 },
});

module.exports = mongoose.model('TokenRevocado', tokenRevocadoSchema);
