const { PrismaClient } = require('@prisma/client');

// Una sola instancia para toda la API: cada PrismaClient abre su propio pool de conexiones
module.exports = new PrismaClient();
