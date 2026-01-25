# Obsidian Habit Tracker — Agent Instructions

## Quick Reference

### Key Files to Edit
Operate on these files when changing behavior: `src/HabitService.ts`, `src/HabitTrackerView.ts`, `src/main.ts`, `src/settings.ts`, `esbuild.config.mjs`, and top-level `package.json` / `README.md`.

### Update & Deploy Workflow
After making code changes:

```bash
cd /path/to/obsidian-habit-tracker
npm run build
cp -v main.js styles.css "YOUR_VAULT_PATH/.obsidian/plugins/obsidian-checklist/"
```

Then reload Obsidian to see changes.

**Note:** Replace `YOUR_VAULT_PATH` with the path to your Obsidian vault (e.g., `/Users/username/Obsidian Vault`)

---

## Architecture

### Overview
- **Main orchestration** (`src/main.ts`): Loads settings, instantiates `HabitService`, registers view and commands
- **UI** (`src/HabitTrackerView.ts`): Renders checklist and statistics, reads `HabitData` from `HabitService`, handles checkbox changes
- **Data/service layer** (`src/HabitService.ts`): Reads/writes Obsidian vault files (uses `App`, `TFile`, `moment`)
  - `getHabitStatus`, `setHabitStatus` — single-day read/write using checkbox regex
  - `autoDetectHabits(days=30)` — scans recent notes for `## Habits` section
  - `getAllHabitData()` — builds 30-day windows, computes streaks and rates

### Storage Format
Habits are stored in daily notes under the `## Habits` section using markdown checkboxes:
```
## Habits

- [x] Habit Name
- [ ] Another Habit
```

**Pattern to preserve**: `- \[([ x])\] ${escapeRegex(habitName)}` (whitespace matters)

---

## Key Patterns & Rules (Do Not Change Lightly)

| Pattern | Location | Details |
|---------|----------|---------|
| Habit section header | `HabitService.ts` | Must be exactly `## Habits` |
| Checkbox regex | `HabitService.ts` | `- \[([ x])\] ${habitName}` — whitespace critical |
| File naming | `settings.ts`, `getFilePath()` | `${date}.md` where date uses `dateFormat` setting (default `YYYY-MM-DD`) |
| Habit command IDs | `main.ts` `addCommandsForHabits()` | `toggle-habit-${habit.toLowerCase().replace(/\s+/g, '-')}` |

**Important**: If changing storage format, update all these locations:
- `HabitService.getHabitStatus`
- `HabitService.setHabitStatus`
- `HabitService.autoDetectHabits`
- `HabitService.findOrCreateHabitSection`

---

## Development Workflows

### Local Development (Watch Mode)
```bash
npm install
npm run dev  # Rebuilds on file change
```

### Production Build
```bash
npm run build  # Runs tsc -noEmit -skipLibCheck && esbuild
```

### Plugin Installation
After `npm run build`, copy to vault:
- `main.js` (bundled CJS output)
- `manifest.json`
- `styles.css`
- `versions.json`

---

## Technical Details

### TypeScript & Bundling
- `tsconfig.json`: Uses `inlineSourceMap` and `ESNext` modules
- `esbuild.config.mjs`: Bundles `src/main.ts` → `main.js` (CJS format), marks `obsidian` and Node builtins as external

### Conventions
- **Date window**: 30-day default used in `getAllHabitData()` and `autoDetectHabits()` — update both if changing
- **Streak mode**: `'strict' | 'lenient'` setting exists; lenient currently behaves like strict (can be enhanced)
- **Folder handling**: `dailyNotesFolder` prepended to filenames by `getFilePath()`; code ensures folder exists before creating files

### Obsidian Integration Points
- `App`, `TFile`, `vault` operations: `getAbstractFileByPath`, `read`, `create`, `modify`, `createFolder`
- Uses `moment()` from Obsidian for date formatting — respect `dateFormat` setting

---

## Testing & Validation

- **After edits**: Run `npm run dev`, test in dev vault
- **Before commit**: Run `npm run build` to ensure TypeScript checks and bundling succeed
- **Check**: No errors in compilation or bundling output

---

## Common Tasks

### Add a new feature
1. Edit relevant file (`HabitService.ts`, `HabitTrackerView.ts`, etc.)
2. Run `npm run build`
3. Copy files to vault and reload Obsidian

### Change storage format
1. Update `HabitService.ts` methods (getHabitStatus, setHabitStatus, autoDetectHabits, findOrCreateHabitSection)
2. Run `npm run build`
3. Deploy and test

### Modify UI/styles
1. Edit `src/HabitTrackerView.ts` for structure, `styles.css` for styling
2. Run `npm run build` (includes CSS copy)
3. Deploy and reload

---

## File Reference

| File | Purpose |
|------|---------|
| `src/HabitService.ts` | Core file I/O and business rules |
| `src/HabitTrackerView.ts` | DOM rendering and user interactions |
| `src/main.ts` | Plugin lifecycle and command wiring |
| `src/settings.ts` | Persisted settings shape and defaults |
| `esbuild.config.mjs` | Build configuration |
| `styles.css` | UI styling |
| `tsconfig.json` | TypeScript configuration |
