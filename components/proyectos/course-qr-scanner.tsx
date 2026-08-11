"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Keyboard, Loader2, RotateCcw, ScanLine, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = {
  ok: boolean;
  status: "valid" | "used" | "cancelled" | "not_ready" | "invalid";
  title: string;
  message: string;
  registration?: { fullName: string; document: string };
  session?: { title: string };
};

type Detector = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};

const RESULT_STYLE: Record<Result["status"], { background: string; color: string }> = {
  valid: { background: "var(--success-soft)", color: "var(--success)" },
  used: { background: "var(--warning-soft)", color: "var(--warning)" },
  cancelled: { background: "var(--danger-soft)", color: "var(--danger)" },
  not_ready: { background: "var(--surface-2)", color: "var(--text-2)" },
  invalid: { background: "var(--danger-soft)", color: "var(--danger)" },
};

export function CourseQrScanner({
  open,
  onOpenChange,
  title,
  scanAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  scanAction: (rawValue: string) => Promise<Result>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const releaseCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const validate = useCallback((rawValue: string) => {
    const value = rawValue.trim();
    if (!value || processingRef.current) return;
    processingRef.current = true;
    releaseCamera();
    startTransition(async () => {
      let response: Result;
      try {
        response = await scanAction(value);
      } catch {
        response = { ok: false, status: "invalid", title: "No se pudo validar", message: "Revisa la conexion e intenta nuevamente." };
      }
      setResult(response);
      processingRef.current = false;
      if (response.ok) toast.success(response.title);
      else toast.error(response.title);
    });
  }, [releaseCamera, scanAction]);

  const startCamera = useCallback(async () => {
    releaseCamera();
    setCameraError("");
    setResult(null);
    processingRef.current = false;
    const BarcodeDetector = (window as Window & { BarcodeDetector?: Detector }).BarcodeDetector;
    if (!BarcodeDetector) {
      setCameraError("Este navegador no tiene lector QR nativo. Usa el campo manual.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || processingRef.current) return;
        try {
          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) return validate(codes[0].rawValue);
          }
        } catch {
          setCameraError("No se pudo leer el video de la camara.");
          releaseCamera();
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError("Permite el acceso a la camara para escanear el QR.");
      releaseCamera();
    }
  }, [releaseCamera, validate]);

  useEffect(() => () => releaseCamera(), [releaseCamera]);

  function changeOpen(next: boolean) {
    if (!next) {
      releaseCamera();
      setManualValue("");
      setResult(null);
      setCameraError("");
      processingRef.current = false;
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine className="size-4 text-brand" /> {title}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <div className="relative aspect-[4/3]">
              <video ref={videoRef} muted playsInline className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-[58%] w-[58%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" /></div>
              {!scanning ? <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-[13px] font-medium text-white">{pending ? "Registrando asistencia..." : "Camara en espera"}</div> : null}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-foreground"><Camera className="size-4 text-brand" /> Camara</div>
              {cameraError ? <p className="mt-2 text-[12px] text-danger">{cameraError}</p> : null}
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={startCamera} disabled={pending || scanning}><Camera className="size-4" /> Activar camara</Button>
            </div>
            <form className="rounded-xl border border-border p-3" onSubmit={(event) => { event.preventDefault(); validate(manualValue); }}>
              <Label htmlFor="course-ticket-code" className="flex items-center gap-2"><Keyboard className="size-4" /> Codigo manual</Label>
              <Input id="course-ticket-code" value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="WMERP:TICKET:..." className="mt-2" />
              <Button type="submit" size="sm" className="mt-3" disabled={pending || !manualValue.trim()}>{pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Registrar</Button>
            </form>
            {result ? (
              <div className="rounded-xl border border-border p-3" style={RESULT_STYLE[result.status]}>
                <div className="flex items-center gap-2 text-[13px] font-bold">{result.ok ? <ShieldCheck className="size-4" /> : <XCircle className="size-4" />}{result.title}</div>
                <p className="mt-1 text-[12px]">{result.message}</p>
                {result.registration ? <div className="mt-3 rounded-lg bg-white/70 p-2 text-[12px] text-foreground"><strong>{result.registration.fullName}</strong><div className="mt-1 text-text-2">CI {result.registration.document}{result.session ? ` · ${result.session.title}` : ""}</div></div> : null}
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setResult(null); setManualValue(""); void startCamera(); }} disabled={pending}><RotateCcw className="size-4" /> Escanear otro</Button>
          <Button type="button" onClick={() => changeOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
