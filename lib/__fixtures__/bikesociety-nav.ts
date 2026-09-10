/**
 * A four-level WordPress PRIMARY menu shaped exactly like Bike Society's.
 *
 * Structure and contents come from the 2026-09-10 parity audit
 * (`260910-bikesociety-full-gap-scout/report.md` §3.3), which lists the old
 * site's EQUIPMENT and CLOTHING & GEAR panels column by column, plus the BIKES
 * panel that has no containers at all. The `Column N` nodes reproduce the real
 * payload the audit captured from the store's own RSC stream:
 *
 * ```json
 * {"id":"268610","label":"Column 1","uri":"/","description":null,
 *  "cssClasses":["hidden"],
 *  "children":[{"id":"236237","label":"Apparel", ... }]}
 * ```
 *
 * Three properties matter and are all present here: containers marked `hidden`
 * with a `/` URI, a fourth level under the column headings, and a container
 * (`Column 4` under CLOTHING & GEAR) whose only child is an empty collection —
 * the one hide-empty drops, leaving a container that must not render.
 *
 * Test-only. Nothing in the app imports it.
 */

/** Same shape as `NavMenuItem` in `components/headkit-ui/navigation-bar.tsx`. */
export interface NavFixtureItem {
  id: string;
  label: string;
  uri: string;
  description: string | null;
  cssClasses: string[];
  children: NavFixtureItem[];
}

let nextId = 1000;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** A collection link, with optional children one level deeper. */
export function link(
  label: string,
  children: NavFixtureItem[] = [],
): NavFixtureItem {
  nextId += 1;
  return {
    id: String(nextId),
    label,
    uri: `/collections/${slugify(label)}/`,
    description: null,
    cssClasses: [],
    children,
  };
}

/** A mega-menu column container: no destination, `hidden`, label never rendered. */
export function column(
  label: string,
  children: NavFixtureItem[],
): NavFixtureItem {
  nextId += 1;
  return {
    id: String(nextId),
    label,
    uri: "/",
    description: null,
    cssClasses: ["hidden"],
    children,
  };
}

export const EQUIPMENT: NavFixtureItem = {
  id: "268600",
  label: "EQUIPMENT",
  uri: "/collections/equipment/",
  description: null,
  cssClasses: [],
  children: [
    column("Column 1", [
      link("Bags & Storage", [
        link("Backpacks"),
        link("Bike Packing"),
        link("Frame"),
        link("Pannier"),
        link("Seat"),
        link("Storage Bottles"),
        link("Travel Bags"),
      ]),
      link("Computers", [link("GPS Computers"), link("Computers Accessories")]),
    ]),
    column("Column 2", [
      link("Components", [
        link("Bearings"),
        link("Bottom Bracket"),
        link("Brake"),
        link("Brake Pads"),
        link("Brake Rotors"),
        link("Cassette"),
        link("Chain"),
        link("Chainring"),
        link("Crankset"),
        link("Derailleur Hangers"),
        link("Drivetrain"),
        link("E-Bike Parts"),
      ]),
    ]),
    column("Column 3", [
      link("Electronic Components"),
      link("Fenders"),
      link("Frame Parts"),
      link("Groupset"),
      link("Handlebars"),
      link("Handlebar Stems"),
      link("Headset"),
      link("Kickstand"),
      link("Pedals"),
      link("Seat Post"),
      link("Shifters"),
      link("Suspension"),
    ]),
    column("Column 4", [
      link("Equipment", [
        link("Baby & Child Seats"),
        link("Bike Carriers"),
        link("Bottles"),
        link("Bottle Cages"),
        link("Grips & Bar Tape"),
        link("Lights"),
        link("Locks"),
        link("Lubricants & Cleaners"),
        link("Mirrors & Bells"),
        link("Pumps"),
        link("Tools"),
        link("Trainers"),
      ]),
    ]),
    column("Column 5", [
      link("Saddles", [link("Fitness"), link("Mountain"), link("Road")]),
      link("Tubes", [
        link("Presta Valve Tubes"),
        link("Repair Kit"),
        link("Schrader Valve Tubes"),
        link("Thorn Resistant Tubes"),
        link("Tubeless Gear"),
      ]),
    ]),
    column("Column 6", [
      link("Tyres", [
        link("BMX & Youth"),
        link("City & Urban"),
        link("CX & Gravel"),
        link("Mountain"),
        link("Road"),
      ]),
      link("Wheels", [
        link("Mountain Wheels"),
        link("Rims"),
        link("Road Wheels"),
        link("Wheel Service Parts"),
      ]),
    ]),
  ],
};

export const CLOTHING_AND_GEAR: NavFixtureItem = {
  id: "268601",
  label: "CLOTHING & GEAR",
  uri: "/collections/clothing-gear/",
  description: null,
  cssClasses: [],
  children: [
    column("Column 1", [
      link("Apparel", [
        link("Base Layer"),
        link("Body Armour"),
        link("Caps & Hats"),
        link("Mens Jersey"),
        link("Mens Shorts & Knicks"),
        link("Socks"),
        link("T-Shirts"),
        link("Winter Gear"),
        link("Womens Jersey"),
        link("Womens Shorts & Knicks"),
      ]),
    ]),
    column("Column 2", [
      link("Eyewear", [link("Sunglasses")]),
      link("Gloves", [
        link("Cold Weather"),
        link("Long Finger"),
        link("Short Finger"),
      ]),
    ]),
    column("Column 3", [
      link("Helmets", [
        link("Kids & Youth"),
        link("Fitness & Recreational"),
        link("Mountain"),
        link("Road"),
        link("Parts & Accessories"),
      ]),
    ]),
    column("Column 4", [
      link("Nutrition & Care", [
        link("Bars"),
        link("Gels"),
        link("Hydration"),
        link("Rider Care"),
      ]),
    ]),
    column("Column 5", [
      link("Shoes", [
        link("Mountain"),
        link("Road"),
        link("Parts & Accessories"),
      ]),
    ]),
    column("Column 6", [
      link("Bike Society Custom Apparel", [link("Lakers Triathlon Club")]),
    ]),
  ],
};

/** Two levels, no containers — the panel that already rendered correctly. */
export const BIKES: NavFixtureItem = {
  id: "268602",
  label: "BIKES",
  uri: "/collections/bikes/",
  description: null,
  cssClasses: [],
  children: [
    link("Electric Bikes", [
      link("E-Bikes Hybrid & Urban"),
      link("E-Bikes Mountain"),
      link("E-Bikes Road & Adventure"),
    ]),
    link("Fitness & Urban Bikes", [
      link("Urban Fitness & Hybrid"),
      link("Womens Urban Fitness & Hybrid"),
    ]),
    link("Kids Bikes", [link("Junior Boys & Girls")]),
    link("Mountain Bikes", [
      link("Dirt Jump"),
      link("Mountain Cross Country"),
      link("Mountain Gravity & DH"),
      link("Mountain Recreational"),
      link("Mountain Trail"),
      link("Frames"),
    ]),
    link("Road Bikes", [
      link("Adventure Gravel & CX"),
      link("Road Endurance"),
      link("Road Performance"),
      link("Road Triathlon & TT"),
      link("Frames"),
    ]),
  ],
};

export const BIKESOCIETY_PRIMARY: NavFixtureItem[] = [
  BIKES,
  EQUIPMENT,
  CLOTHING_AND_GEAR,
];
