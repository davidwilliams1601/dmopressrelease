PressPilot Landing Page — Image Slots
======================================

Place the following image files in this directory to replace the placeholder
divs on the landing page (src/app/page.tsx).

hero.jpg
  Recommended size: 1200 × 800 px (3:2 ratio)
  Usage: Right-hand column of the hero section
  Suggested content: A vibrant destination photo or a team using a laptop,
                     light/airy feel to complement the left-hand copy

banner.jpg
  Recommended size: 1920 × 600 px (16:5 ratio)
  Usage: Full-width feature strip between the stats row and the contact form
  Suggested content: A wide landscape of a destination, or a team meeting;
                     the image will have a dark overlay so contrast matters less

To swap in real images, replace the placeholder <div> in page.tsx with:

  import Image from 'next/image';

  <div className="relative aspect-[3/2] overflow-hidden rounded-2xl">
    <Image src="/images/hero.jpg" alt="..." fill className="object-cover" />
  </div>

All images in this directory are served as static assets by Next.js.
