# Media Embedding in Content

When generating or updating `content/` pages from `src/sources/`:

## Path resolution

Resolve media references (frontmatter `media_refs` and any `public/media/...` links in the source body) to **web paths**: `/media/YYYY-MM-DD_short_descriptive_name/asset.jpg` (same relative path under `public/media/`).

## Images

Embed using standard Markdown image syntax:

```markdown
![alt text](/media/YYYY-MM-DD_short_descriptive_name/asset.jpg)
```

Fumadocs `ImageZoom` (via `mdx-components.tsx`) renders these.

## Audio

```mdx
<AudioPlayer
  src="/media/YYYY-MM-DD_short_descriptive_name/audio.mp3"
  title="Audio title"
/>
```

## Video URLs

```mdx
<VideoPlayer url="https://www.youtube.com/watch?v=abc123" title="Video title" />
```

## Placement

Place each media item **after** the block of text it is associated with (text first, then related media). Tie media to the preceding content with proximity or a short caption.
