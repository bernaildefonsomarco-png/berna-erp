import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useComando } from '../ComandoContext';
import QuickEntry from '../../../components/QuickEntry/QuickEntry';

export default function RegistrarPagoDeuda() {
  const navigate = useNavigate();
  const { usuario, refrescarCuentas } = useComando();
  const [abierto, setAbierto] = useState(true);

  const handleSubmit = async () => {
    await refrescarCuentas();
    navigate('/comando');
  };

  return abierto ? (
    <QuickEntry
      scope="comando"
      contexto={{ idUbicacion: usuario?.id_ubicacion_preferida ?? null }}
      filtroDireccion="salida"
      tiposPermitidos={null}
      onSubmit={handleSubmit}
      onClose={() => { setAbierto(false); navigate('/comando'); }}
    />
  ) : null;
}
