export type RightNowPerson = {
  id: "oo" | "xx";
  name: string;
  eyebrow: string;
  title: string;
  body: string[];
  imageSrc: string;
  imageAlt: string;
  layout: "photo-left" | "photo-right";
  rotation: number;
};

export const RIGHT_NOW_PEOPLE: RightNowPerson[] = [
  {
    id: "oo",
    name: "oo",
    eyebrow: "soft signal",
    title: "Collecting small pieces of today",
    body: [
      "oo keeps the quiet parts of the day close: a line from a book, a photo before sleep, a small note that waits patiently across timezones.",
      "In this space, oo feels like the gentle signal that turns ordinary moments into something worth saving together.",
    ],
    imageSrc: "/images/about/oo.jpg",
    imageAlt: "Portrait of oo",
    layout: "photo-left",
    rotation: -4,
  },
  {
    id: "xx",
    name: "xx",
    eyebrow: "warm anchor",
    title: "Making distance feel less far",
    body: [
      "xx brings a steady warmth to the room: practical care, late-night thoughts, and the kind of presence that makes the screen feel less like glass.",
      "Here, xx is the anchor for shared rituals, unfinished stories, and the next little thing to look forward to.",
    ],
    imageSrc: "/images/about/xx.jpg",
    imageAlt: "Portrait of xx",
    layout: "photo-right",
    rotation: 3.5,
  },
];
