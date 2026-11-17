'use strict';

const mongoose = require('mongoose');

const CATEGORIAS = ['Electrónica', 'Hogar', 'Alimentos', 'Ropa', 'Papelería', 'Otros'];

const productoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio.'],
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
      maxlength: [100, 'El nombre no puede exceder 100 caracteres.'],
    },
    sku: {
      type: String,
      required: [true, 'El SKU es obligatorio.'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]{3,20}$/, 'El SKU debe tener de 3 a 20 letras, números o guiones.'],
    },
    descripcion: {
      type: String,
      trim: true,
      maxlength: [500, 'La descripción no puede exceder 500 caracteres.'],
      default: '',
    },
    precio: {
      type: Number,
      required: [true, 'El precio es obligatorio.'],
      min: [0, 'El precio no puede ser negativo.'],
    },
    stock: {
      type: Number,
      min: [0, 'El stock no puede ser negativo.'],
      validate: { validator: Number.isInteger, message: 'El stock debe ser un número entero.' },
      default: 0,
    },
    categoria: {
      type: String,
      enum: { values: CATEGORIAS, message: 'La categoría {VALUE} no es válida.' },
      default: 'Otros',
    },
    // Relación 1:N: un usuario registra muchos productos
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  },
);

productoSchema.index({ categoria: 1, createdAt: -1 });

const Producto = mongoose.model('Producto', productoSchema);

module.exports = Producto;
module.exports.CATEGORIAS = CATEGORIAS;
