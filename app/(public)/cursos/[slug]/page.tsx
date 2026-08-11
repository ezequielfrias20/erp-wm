import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";
import { getPublicCourseCatalog } from "@/lib/course-registration-service";
import { CourseRegistrationForm } from "./registration-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublicCourseCatalog(slug).catch(() => null);
  return { title: course ? `Inscripcion · ${course.name}` : "Curso no disponible" };
}

export default async function PublicCoursePage({ params }: Props) {
  const { slug } = await params;
  const [course, bcv] = await Promise.all([
    getPublicCourseCatalog(slug).catch(() => null),
    fetchBcvRate().catch(() => ({ rate: BCV_FALLBACK, updatedAt: "", source: "BCV" })),
  ]);
  if (!course) notFound();
  return <CourseRegistrationForm course={course} bcvRate={bcv.rate} />;
}
