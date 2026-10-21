# Trenchable Team: editor guide

Trenchable Team is the team's website for making images, video, voiceovers and music with AI. Everything you make is
saved in one shared feed, so nothing gets lost in a downloads folder. This page covers everything you need; setup is
your admin's job.

## Signing in

1. Your admin sends you the site address, your email and a **temporary password**.
2. Sign in with them. You'll be asked to choose your own password, at least 10 characters.
3. From then on, use your own password. Change it any time with the key icon at the top right.

Forgot it? Ask your admin for a new temporary one.

## Finding your way

The bar across the top has **Studio** (where you make things) and **Library** (your team's files). On the right is
the team's **Kie credit balance**: every generation is paid from it, shared by everyone.

The Studio is one page:

- **The feed** fills the page: the team's results, newest first. Jobs that are still running appear in it with a
  progress bar and become the finished result in place.
- **The composer** floats at the bottom. That's where you pick a model, write a prompt and press Generate.
- **Filter** (above the feed) narrows it by model, type, person or date, and sorts by newest, oldest or cost.
  **View** changes the tile size.

## Making something

1. **Pick a model** from the model menu. Type to search, or start from **Featured**. Some models come in tiers
   (Standard, Pro, 4K); switch tiers inside the same entry.
2. **Write the prompt.** Say what you want to see: subject, setting, light, camera, mood. For video, say how things
   move.
3. **Add references** if you want them (see below).
4. **Set the options** with the pills under the prompt: aspect ratio, resolution, duration. Only what the model
   supports is shown. **Variants** makes 1 to 4 versions at once.
5. **Check the price** next to the Generate button. Kie models show credits and dollars, for example
   `≈ 140 cr · $0.70`. It changes as you change options, variants or length.
6. **Press Generate**, or **Ctrl+Enter** (**Cmd+Enter** on a Mac).

Images take about 10 to 30 seconds. Video takes one to five minutes, longer when Kie is busy. You can keep working
while you wait.

The composer remembers your prompt and model when you reload, and each model remembers its own last settings.

### What to use for what

| You want | Use | Rough price |
|---|---|---|
| Quick drafts and ideas | Nano Banana 2 Lite | 2¢ an image |
| Finished images, ads, text in the picture | Nano Banana Pro | 9¢ (12¢ at 4K) |
| Exact layouts, lots of text, many references | GPT Image 2 | 3¢ to 8¢ |
| The same, newer, or a cut-out on a transparent background | GPT Image 2.5 (Flare or Sunburst) | 3¢ to 8¢ |
| Cheap video | Hailuo H3 at 768P | about 24¢ for 6 seconds |
| The best motion | Kling 3.0 or Seedance 2.0 | about 35¢ for 5 s on Kling 3.0 Standard |
| A talking head from a voiceover | Kling AI Avatar (a face picture plus an audio file) | 4¢ a second |
| A voiceover | ElevenLabs Voice: pick a voice, paste the script | 10¢ per 1,000 characters |
| Two people talking | ElevenLabs Dialogue: one line per turn, like `Liam: Wait, is that new?` | 10¢ per 1,000 characters |
| A song | Suno V6 | 6¢ for two takes |
| A sharper, bigger image | Recraft Crisp Upscale or Topaz Image Upscale | under 1¢ / 5¢ to 10¢ |

Draft cheap, finish expensive: get the prompt right on Nano Banana 2 Lite or Hailuo at 768P, then switch to the
better model for the final.

## References and `@image1`

References show the model what to keep: a product, a face, a place, a style, a motion.

- Click **+** in the composer to add one: **Upload** from your computer, pick from the **Library**, or attach an
  **Element**. You can also drop files on the composer.
- Each reference gets a name in order: `@image1`, `@image2`, `@video1`, `@audio1`. Use them in the prompt, for example
  *"the woman in @image1 holding the bottle from @image2"*. Mentions of files you've attached are highlighted.
- Removing a reference renumbers the rest, and the prompt is kept in step.
- Video models let you choose between **frames** (exactly how the clip starts, and on some models how it ends) and
  **references** (images, clips and audio to draw from). Each box says how many you can add and how many seconds are
  left.
- Kling 3.0 also takes named elements: add a start frame, then an element with 2 to 4 photos, and write `@name` in the
  prompt.
- Reference videos raise the price on Seedance and Omni Flash. The price updates as you add them.

## Elements

Elements are the team's saved characters, products, locations and styles. Each has a name, a few notes and up to 12
pictures. Open **+ → Elements** in the composer and pick one: its pictures are attached as references in one click.

Everyone can use every element. Only the person who made one, or an admin, can change or delete it.

## Working with results

Click any result to open the viewer.

| Key | Does |
|---|---|
| **←** / **→** | Previous / next result |
| **D** | Download |
| **Esc** | Close |

| Button | Does |
|---|---|
| **Download** | Saves the file. Images can also be saved as WebP: the same picture, roughly 90% smaller |
| **Re-run** | Makes a fresh take with exactly the same settings |
| **Load settings** | Puts its model, prompt and options back in the composer so you can change them |
| **Use as reference** | Attaches it to the composer, if the current model can take it |
| **Copy prompt** | Copies the prompt |
| **Make private** / **Share with team** | Hides it from the team, or shares it again |
| **Delete** | Removes it. Click twice to confirm |

You can only make private or delete your own work.

## Downloading many at once

Tick the box on a tile to start a selection. Shift-click another tile to select everything in between, or use
**Select all**. Then **Download zip** gives one zip of the originals, or of the images as WebP. **Delete** removes them
together; anything that isn't yours is skipped.

## Private or shared

Your results are shared with the team by default. To keep one to yourself, open **Advanced** in the composer before
you generate and turn off **Share with the team**. You can change it later from the viewer. Admins can still see
private results.

## Files expire after 7 days

Storage costs money, so generated images, videos and audio are deleted **7 days** after they're made (your admin can
change this). What stays:

- The tile, with its prompt, settings and price. It reads "File removed after 7 days", and **Re-run** makes it again
  at the usual price.
- Everything you **uploaded** yourself. Uploads are never deleted.

Tiles say "Deletes in 2 days", then "tomorrow", then "today". Download anything you want to keep before then.

## The Library

The **Library** holds every uploaded file and every output. Filter it by type and by source (uploads or generated).
Drop files anywhere on the page to upload them. Click a file to preview it, download it, or **Use in generation**.

## When something goes wrong

A running tile tells you where the job is:

| You see | It means |
|---|---|
| A bar and "Usually takes about…" | Normal. The bar is an estimate from how long this model usually takes for the team |
| "Taking longer than usual" | Kie is busy. The job keeps its place in line; don't re-run it |
| A **Retried** note | Kie had a hiccup and the job was sent again for you. Nothing to do |
| "Finishing up" | The file is still being copied into the team's storage |
| A notice above the feed about Kie | Kie is having trouble for everyone, not just you |

A failed tile says why. Kie doesn't charge for failed jobs.

| The tile says | What to do |
|---|---|
| Out of credits | Ask your admin to top up, then re-run |
| Blocked by the model's safety filter | Change the prompt or the reference files |
| The model rejected these settings | Check the references and options |
| The provider had an error, or never returned the job | Try again in a few minutes |
| "Couldn't load your ElevenLabs voices" | Tell your admin; the voice key needs fixing |
| A red note in the composer before you generate | Something is missing or not allowed for this model, like a prompt, a picture or an audio file. The note says which |

Still stuck? Send your admin a screenshot of the tile.
