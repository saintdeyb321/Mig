# Estructura recomendada de Firestore para POS SaaS

## products
- id (auto)
- name: string
- price: number
- category: string
- status: 'activo' | 'inactivo'
- businessId: string (ID del negocio dueño del producto)

## categories
- id (auto)
- name: string
- businessId: string

## sales
- id (auto)
- items: array de { id, name, qty, price }
- total: number
- payment: 'efectivo' | 'yape'
- amountPaid: number
- change: number
- date: timestamp
- businessId: string
- userId: string (quién realizó la venta)

## users
- id (auto)
- email: string
- role: 'dueño' | 'cajero'
- businessId: string

## licenses
- id (businessId)
- expiry: timestamp
- status: 'activa' | 'vencida'

---

**Notas:**
- Todas las colecciones deben tener el campo businessId para separar los datos de cada negocio.
- Las reglas de seguridad ya están preparadas para este modelo.
- Si tienes datos existentes, deberás migrarlos agregando el campo businessId a cada documento.
