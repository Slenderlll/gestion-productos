'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const ROLES = ['usuario', 'admin'];
const RONDAS_BCRYPT = 10;

const usuarioSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio.'],
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
      maxlength: [60, 'El nombre no puede exceder 60 caracteres.'],
    },
    correo: {
      type: String,
      required: [true, 'El correo es obligatorio.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no tiene un formato válido.'],
    },
    // Nunca se devuelve en las consultas salvo que se pida con .select('+password')
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria.'],
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres.'],
      select: false,
    },
    rol: {
      type: String,
      enum: { values: ROLES, message: 'El rol {VALUE} no es válido.' },
      default: 'usuario',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// La contraseña se guarda cifrada; solo se vuelve a cifrar si cambió
usuarioSchema.pre('save', async function cifrarPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, RONDAS_BCRYPT);
});

usuarioSchema.methods.compararPassword = function compararPassword(candidata) {
  return bcrypt.compare(candidata, this.password);
};

const Usuario = mongoose.model('Usuario', usuarioSchema);

module.exports = Usuario;
module.exports.ROLES = ROLES;
