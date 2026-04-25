// src/views/gestion/views/admin/_shared.jsx
export function Modal({ title, onCancel, onGuardar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        <div className="grid grid-cols-2 gap-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border px-3 py-2 text-sm">Cancelar</button>
          <button onClick={onGuardar} className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white">Guardar</button>
        </div>
      </div>
      <style>{`.inp{width:100%;border:1px solid #d6d3d1;border-radius:6px;padding:6px 10px;font-size:0.875rem}`}</style>
    </div>
  );
}

export function F({ label, children }) {
  return (
    <label className="block col-span-1">
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}
