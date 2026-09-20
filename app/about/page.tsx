import { AboutView, type AboutViewPerson } from "@/components/about/AboutView";
import { RIGHT_NOW_PEOPLE } from "@/components/about/right-now-content";
import { resolveAboutPhoto } from "@/lib/about-photos";

// 照片是 public 下的部署资产，按请求解析，交付后无需重新构建即可生效。
export const dynamic = "force-dynamic";

export default function AboutPage() {
  const people: AboutViewPerson[] = RIGHT_NOW_PEOPLE.map(({ imageSrc, imageAlt, ...person }) => ({
    ...person,
    photo: resolveAboutPhoto({ imageSrc, imageAlt }),
  }));

  return <AboutView people={people} />;
}
