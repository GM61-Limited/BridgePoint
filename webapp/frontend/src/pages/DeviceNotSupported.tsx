// src/pages/DeviceNotSupported.tsx
export default function DeviceNotSupported() {
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100">
      <div className="text-center p-4 border rounded-3">
        <i className="bi bi-laptop fs-1 mb-3" />
        <h1 className="h4 fw-bold">Desktop only</h1>
        <p className="text-secondary">
          BridgePoint is designed for laptops and desktop computers.
          <br />
          Please open this app on a larger screen.
        </p>
      </div>
    </div>
  );
}