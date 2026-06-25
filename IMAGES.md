# Feed image prompts (OpenAI image gen)

The feed reads photos from **`public/images/`**. Generate each image, **save it as the exact filename**, drop them all into that folder, then reload the app (⌘R) — they appear automatically. Until a file exists, the post shows a clean labeled gradient placeholder (no broken images).

**Generation settings:** landscape, **1792×1024** (DALL·E 3) or **1536×1024** (gpt-image-1), export **.jpg**.

**Prepend this STYLE line to every prompt below:**

> Photorealistic editorial documentary photograph for a K–8 charter school family newsletter. Bright warm natural light, vibrant and joyful, hopeful. A diverse group of New York City elementary "scholars" ages 5–10 (predominantly Black and Latino, also South Asian, East Asian, and white) in a school uniform of an **orange polo shirt with navy bottoms**. Clean, modern school setting. Candid, in-the-moment, gentle shallow depth of field, true-to-life skin tones. **No text, no logos, no watermarks.** Wide 16:9 landscape. Subject: —

---

## In the demo feed — generate these 20 first

| Filename | Prompt (subject) |
|---|---|
| `movingup-ceremony.jpg` | A "moving up" ceremony in a school cafeteria: proud 4th-grade scholars on a small stage, families clapping in folding chairs, balloons and a celebratory (text-free) banner. |
| `chess-team.jpg` | A youth chess team of ~10 scholars with their coach, posing together holding a 2nd-place trophy, chessboards on tables in front, big smiles. |
| `chess-closeup.jpg` | Close-up of a focused young scholar mid-move over a tournament chessboard, hand on a piece, brow furrowed in concentration. |
| `reading-wall.jpg` | A colorful classroom reading corner: labeled bins of leveled books, a cozy rug and beanbags, a wall of book covers, soft afternoon light. |
| `book-tasting.jpg` | A classroom set up like a "book tasting": desks with open books and little paper menus, scholars wandering and sampling chapters. |
| `science-circuits.jpg` | Scholars at a lab table building a simple electric circuit with batteries and wires, a small bulb just lit, delighted faces. |
| `science-plants.jpg` | Scholars examining seedlings in clear cups on a sunny windowsill, magnifying glasses and a notebook. |
| `science-bridge.jpg` | Two scholars testing a popsicle-stick bridge by stacking weights on it, focused teamwork. |
| `art-showcase.jpg` | A school art-show gallery wall covered in children's self-portraits and clay sculptures on pedestals, families viewing. |
| `art-painting.jpg` | Scholars painting at easels in an art room, colorful smocks, brushes and palettes, paint-splattered joy. |
| `field-trip-museum.jpg` | Elementary scholars on a field trip in a grand natural-history museum hall, gazing up in wonder, a chaperone pointing. |
| `museum-dino.jpg` | Scholars sketching a towering dinosaur skeleton in a museum, clipboards in hand, looking up amazed. |
| `group-cheer.jpg` | A whole class of scholars grouped together cheering with arms up, lots of orange, pure school-spirit energy. |
| `hallway-art.jpg` | A bright school hallway lined with student artwork and bulletin boards, a few scholars walking in a line. |
| `soccer-team.jpg` | A youth soccer team of young scholars on a city field in orange jerseys, coach kneeling, a ball in front, team-photo vibe. |
| `field-day-relay.jpg` | Outdoor field day in a NYC park: scholars in house-color t-shirts mid-relay race with batons and cones, cheering, sunny. |
| `kindergarten-circle.jpg` | Kindergarten scholars cross-legged on a colorful rug in a circle at morning meeting, teacher reading a big picture book. |
| `morning-arrival.jpg` | Morning arrival at a school entrance: a staff member warmly greeting scholars with a high-five, backpacks, sunshine. |
| `celebration-confetti.jpg` | Scholars celebrating with certificates and a little confetti in the air, big grins (no readable text on the certificates). |
| `scholar-portrait.jpg` | A warm portrait of one beaming elementary scholar in an orange polo, holding a book to their chest, soft classroom bokeh. |

## Bonus library — use in posts you compose (optional)

| Filename | Prompt (subject) |
|---|---|
| `reading-workshop.jpg` | Scholars reading independently at their desks in a bright classroom, absorbed in books. |
| `math-lesson.jpg` | A teacher at a whiteboard during a math lesson with many scholars eagerly raising hands. |
| `small-group.jpg` | A teacher working with a small group around a kidney-shaped table with manipulatives. |
| `writing-workshop.jpg` | Close-up of a scholar writing in a composition notebook with a pencil, deep concentration. |
| `library-browse.jpg` | Scholars browsing shelves in a school library, a librarian helping. |
| `lunch-cafeteria.jpg` | Scholars eating lunch together at long tables in a bright cafeteria, chatting and smiling. |
| `music-class.jpg` | Scholars in music class with simple percussion and recorders, mid-song, joyful. |
| `pe-gym.jpg` | Scholars in a gym during PE doing a colorful parachute activity, movement and laughter. |
| `dance-movement.jpg` | Scholars doing a movement/dance activity in a multipurpose room, arms outstretched mid-motion. |
| `coding-tablets.jpg` | Scholars using tablets for a coding activity, colorful block-code on screens, working in pairs. |
| `garden.jpg` | Scholars tending a small school garden with raised planter boxes, watering cans, green sprouts. |
| `field-day-tug.jpg` | A spirited tug-of-war on a sunny field, two teams of scholars pulling a rope, straining and laughing. |
| `teacher-portrait.jpg` | A warm portrait of a friendly Black male elementary lead teacher in a classroom, kind smile, books behind. |
| `principal-portrait.jpg` | A warm portrait of a confident female principal in a school hallway, professional and approachable. |
| `family-event.jpg` | An evening family event in a school cafeteria: parents and scholars at tables, warm string lights, community feel. |
| `graduation-hug.jpg` | A heartfelt moment of a scholar hugging their teacher at a moving-up ceremony, both smiling, joyful. |
