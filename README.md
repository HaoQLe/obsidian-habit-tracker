# Daily Habit Checklist - Obsidian Plugin

A simple Obsidian plugin to track daily habits using a checklist-based system with streak tracking and statistics.

## Features

- **Checklist View**: Daily checklist with checkboxes for each habit
- **Streak Tracking**: Automatically tracks current and longest streaks for each habit
- **Statistics View**: View completion rates, streaks, and recent activity
- **Daily Notes Integration**: Stores habit data in your daily notes (YYYY-MM-DD.md format)

## Installation

### Manual Installation

1. Clone or download this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Copy the `main.js`, `manifest.json`, `styles.css`, and `versions.json` files to your vault's `.obsidian/plugins/obsidian-checklist/` folder
5. Enable the plugin in Obsidian Settings > Community plugins

### Development

1. Clone this repository
2. Run `npm install`
3. Run `npm run dev` to start development mode (auto-rebuilds on changes)
4. Make changes to the TypeScript files
5. Reload Obsidian to see changes

## Usage

1. **Configure Habits**: Go to Settings > Daily Habit Checklist and add your habits
2. **Set Daily Notes Folder** (optional): Specify the folder where your daily notes are stored (leave empty for root)
3. **Open Checklist View**: Click the ribbon icon or use the command palette to open the checklist view
4. **Check Off Habits**: Click the checkboxes to mark habits as complete for today
5. **View Statistics**: Open the statistics view to see streaks, completion rates, and recent activity

## How It Works

The plugin stores habit data in your daily notes using a "Habits" section with checkboxes:

```markdown
## Habits

- [x] Exercise
- [ ] Read for 30 minutes
- [x] Meditate
```

The plugin automatically:
- Creates daily note files if they don't exist
- Tracks completion status for each habit
- Calculates streaks (consecutive days completed)
- Generates statistics and visualizations

## Commands

- **Open Habit Checklist**: Opens the checklist view
- **Open Statistics View**: Opens the statistics view

## Settings

- **Daily notes folder**: Folder where daily notes are stored (default: root)
- **Habits**: List of habits to track

## License

MIT
