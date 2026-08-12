"use client";

import { useActionState, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Loader2, MapPin, ReceiptText, UserRound } from "lucide-react";
import { registerForCourse, type PublicCourseFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectPaymentMethod } from "@/lib/database.types";

type AttendeeDraft = {
  nombre: string;
  apellido: string;
  documento: string;
  email: string;
  telefono: string;
};

type Course = {
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  logoUrl: string | null;
  organizerName: string | null;
  organizerEmail: string | null;
  organizerPhone: string | null;
  paymentInstructions: string | null;
  timezone: string;
  groups: Array<{
    id: string;
    name: string;
    capacity: number;
    available: number;
    priceUsd: number;
    location: string | null;
    sessions: Array<{
      id: string;
      title: string | null;
      startsAt: string;
      endsAt: string;
      location: string | null;
      instructor: string | null;
    }>;
  }>;
};

const METHODS: ProjectPaymentMethod[] = [
  "Pago móvil",
  "Efectivo USD",
  "Zelle/Zinli",
  "Binance",
  "Cashea",
];

function sessionDate(value: string) {
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Caracas",
  }).format(new Date(value));
}

export function CourseRegistrationForm({ course, bcvRate }: { course: Course; bcvRate: number }) {
  const action = registerForCourse.bind(null, course.slug);
  const [state, formAction, pending] = useActionState<PublicCourseFormState, FormData>(action, null);
  const [groupId, setGroupId] = useState(course.groups.find((group) => group.available > 0)?.id ?? "");
  const [method, setMethod] = useState<ProjectPaymentMethod>("Pago móvil");
  const [quantity, setQuantity] = useState(1);
  const [attendees, setAttendees] = useState<AttendeeDraft[]>(
    Array.from({ length: 10 }, () => ({
      nombre: "",
      apellido: "",
      documento: "",
      email: "",
      telefono: "",
    })),
  );
  const selectedGroup = course.groups.find((group) => group.id === groupId);
  const requiresReceipt = method !== "Efectivo USD";
  const maxQuantity = Math.min(10, selectedGroup?.available ?? 1);
  const safeQuantity = Math.min(quantity, Math.max(1, maxQuantity));
  const activeAttendees = attendees.slice(0, safeQuantity);
  const attendeesJson = JSON.stringify(activeAttendees);
  const totalUsd = (selectedGroup?.priceUsd ?? 0) * safeQuantity;

  function updateAttendee(index: number, key: keyof AttendeeDraft, value: string) {
    setAttendees((current) =>
      current.map((attendee, itemIndex) =>
        itemIndex === index ? { ...attendee, [key]: value } : attendee,
      ),
    );
  }

  if (state?.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-[560px] rounded-xl border border-border bg-card p-6 text-center shadow-card-sm sm:p-8">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-6" /></span>
          <h1 className="mt-4 text-[22px] font-bold text-foreground">Inscripcion recibida</h1>
          <p className="mx-auto mt-2 max-w-[52ch] text-[14px] leading-6 text-text-2">Revisaremos el pago. Cuando sea aprobado recibiras por correo tu entrada con el QR y las jornadas del curso.</p>
          <div className="mx-auto mt-5 max-w-[320px] rounded-lg bg-surface-2 px-4 py-3">
            <div className="text-[11px] text-text-3">Codigo de orden</div>
            <div className="mt-1 font-mono text-[18px] font-bold text-foreground">{state.code}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-4 py-5 sm:px-6">
          {course.logoUrl ? (
            <span
              aria-hidden="true"
              className="block size-12 flex-none rounded-lg border border-border bg-white bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${course.logoUrl}")` }}
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[21px] font-bold text-foreground sm:text-[24px]">{course.name}</h1>
            <p className="mt-1 text-[13px] text-text-2">{course.organizerName || "Inscripcion al curso"}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-7 sm:px-6 lg:grid-cols-[1fr_420px] lg:py-10">
        <section className="min-w-0">
          {course.description ? <p className="max-w-[68ch] text-[14px] leading-6 text-text-2">{course.description}</p> : null}
          <h2 className="mt-6 text-[16px] font-bold text-foreground">Selecciona el horario</h2>
          <div className="mt-3 flex flex-col gap-3">
            {course.groups.map((group) => {
              const disabled = group.available === 0;
              return (
                <label key={group.id} className="block cursor-pointer rounded-xl border border-border bg-card p-4 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
                  <input type="radio" name="group-preview" value={group.id} checked={groupId === group.id} onChange={() => setGroupId(group.id)} disabled={disabled} className="sr-only" />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="text-[14px] font-semibold text-foreground">{group.name}</div><div className="mt-1 text-[12px] text-text-2">{disabled ? "Sin cupos" : `${group.available} cupos disponibles`}</div></div>
                    <div className="text-[17px] font-bold text-foreground">${group.priceUsd.toFixed(2)}</div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                    {group.sessions.map((session) => (
                      <div key={session.id} className="flex items-start gap-2 text-[12px] leading-5 text-text-2">
                        <CalendarDays className="mt-0.5 size-3.5 flex-none text-brand" />
                        <span><strong className="font-semibold text-foreground">{session.title || "Jornada"}:</strong> {sessionDate(session.startsAt)}{session.location ? `, ${session.location}` : ""}</span>
                      </div>
                    ))}
                    {group.sessions.length === 0 ? <div className="text-[12px] text-text-3">Fechas por confirmar.</div> : null}
                  </div>
                </label>
              );
            })}
            {course.groups.length === 0 ? <div className="rounded-lg border border-border bg-card p-5 text-[13px] text-text-2">No hay grupos abiertos en este momento.</div> : null}
          </div>

          {selectedGroup ? (
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-text-2">
              <span className="inline-flex items-center gap-1.5"><Clock3 className="size-4" /> {selectedGroup.sessions.length} jornada(s)</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> {selectedGroup.location || course.location || "Lugar por confirmar"}</span>
            </div>
          ) : null}
        </section>

        <section className="self-start rounded-xl border border-border bg-card p-5 shadow-card-sm sm:p-6">
          <div className="flex items-center gap-2"><UserRound className="size-4 text-brand" /><h2 className="text-[16px] font-bold text-foreground">Datos de inscripción</h2></div>
          <form action={formAction} encType="multipart/form-data" className="mt-5 flex flex-col gap-4">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="cantidad" value={safeQuantity} />
            <input type="hidden" name="asistentes" value={attendeesJson} />
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="course-quantity">Cantidad de estudiantes</Label>
              <Select
                value={String(safeQuantity)}
                onValueChange={(value) => setQuantity(Number(value))}
                disabled={!selectedGroup}
              >
                <SelectTrigger id="course-quantity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: maxQuantity }, (_, index) => index + 1).map((item) => (
                    <SelectItem key={item} value={String(item)}>
                      {item} estudiante{item > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-4">
              {activeAttendees.map((attendee, index) => (
                <div key={index} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="mb-3 text-[12.5px] font-bold text-foreground">
                    Estudiante {index + 1}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Field
                      label="Nombre"
                      name={`attendee-${index}-first-name`}
                      value={attendee.nombre}
                      onChange={(event) => updateAttendee(index, "nombre", event.target.value)}
                      autoComplete="given-name"
                      required
                    />
                    <Field
                      label="Apellido"
                      name={`attendee-${index}-last-name`}
                      value={attendee.apellido}
                      onChange={(event) => updateAttendee(index, "apellido", event.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    <Field
                      label="Cedula o documento"
                      name={`attendee-${index}-document`}
                      value={attendee.documento}
                      onChange={(event) => updateAttendee(index, "documento", event.target.value)}
                      autoComplete="off"
                      required
                    />
                    <Field
                      label="Correo"
                      name={`attendee-${index}-email`}
                      type="email"
                      value={attendee.email}
                      onChange={(event) => updateAttendee(index, "email", event.target.value)}
                      autoComplete="email"
                      required
                    />
                    <Field
                      label="Telefono"
                      name={`attendee-${index}-phone`}
                      type="tel"
                      value={attendee.telefono}
                      onChange={(event) => updateAttendee(index, "telefono", event.target.value)}
                      autoComplete="tel"
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2"><ReceiptText className="size-4 text-brand" /><h3 className="text-[14px] font-bold text-foreground">Pago</h3></div>
              {selectedGroup ? <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-text-2">Total: <strong className="text-foreground">${totalUsd.toFixed(2)}</strong>{method === "Pago móvil" ? ` · Bs. ${(totalUsd * bcvRate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</div> : null}
              {course.paymentInstructions ? <p className="mt-3 whitespace-pre-line text-[12.5px] leading-5 text-text-2">{course.paymentInstructions}</p> : null}
              <div className="mt-3 flex flex-col gap-1.5"><Label>Metodo de pago</Label><Select name="metodoPago" value={method} onValueChange={(value) => setMethod(value as ProjectPaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              {requiresReceipt ? (
                <div className="mt-3 flex flex-col gap-3">
                  <Field label="Numero de referencia" name="referencia" required />
                  <div className="flex flex-col gap-1.5"><Label htmlFor="course-receipt">Comprobante</Label><Input id="course-receipt" name="comprobante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></div>
                </div>
              ) : null}
            </div>

            {state?.error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{state.error}</p> : null}
            <Button type="submit" disabled={pending || !groupId || !selectedGroup?.available} className="mt-1 h-10 font-semibold">{pending ? <Loader2 className="size-4 animate-spin" /> : null}Enviar inscripcion</Button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  return <div className="flex flex-col gap-1.5"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} {...props} /></div>;
}
