const jwt = require('jsonwebtoken');

// Verifica el token del header Authorization y deja los datos del usuario en req.usuario
function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Falta el token' } });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.rol || payload.proposito) {
      return res.status(401).json({ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'Token inválido o de tipo incorrecto' } });
    }
    req.usuario = { id: payload.sub, rol: payload.rol }; // id_usuario es un uuid (string)
    next();
  } catch {
    return res.status(401).json({ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'Token inválido o vencido' } });
  }
}

// Deja pasar solo a los roles indicados. Siempre va después de autenticar:
//   router.post('/necesidades', autenticar, autorizar('institucion'), crearNecesidad)
function autorizar(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: { codigo: 'SIN_PERMISO', mensaje: 'No tenés permiso para esta acción' } });
    }
    next();
  };
}

module.exports = { autenticar, autorizar };
