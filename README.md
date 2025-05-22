# Custom Commands Viewer for VS Code
## Overview
The "Custom Commands Viewer" is a VS Code extension designed to manage and execute frequently used shell commands directly within the editor's familiar Explorer view.

This extension treats your custom commands like virtual files, enabling intuitive interactions such as opening them in an editor for quick modifications, renaming them, and even duplicating them directly from the Explorer's context menu.

## Features
- **Explorer Integration**: Manage your commands within a dedicated view in the VS Code Activity Bar, just like managing files in your project.
- **Intuitive Command Creation**: Add new commands by entering the shell command content and optionally providing a friendly display name. Commands without a name will intelligently display their shell command content.
- **Direct Editing**: Click on a command in the tree view to open it in a temporary editor. Modify the command content directly and save your changes for instant updates.
- **Rename & Delete**: Leverage VS Code's native Explorer functionalities to rename or delete your custom commands directly from the tree view's context menu.
- **Duplicate Commands**: Quickly create copies of existing commands, allowing for easy variation and iteration without starting from scratch.
- **Execute from Editor**: Run any command directly from its context menu in the Explorer view.
- **Import/Export Commands**: Share your command collections with teammates or back them up by exporting them to a JSON file. Easily import command lists from JSON files, with built-in duplicate detection.

## How to Use
1. **Access the View**: After installation, a new icon (shaped like a terminal) will appear in your VS Code Activity Bar on the left. Click it to open the "Custom Commands" view.

2. **Create a New Command**:
Click the "Create New Command" icon (a plus sign or new file icon) in the title bar of the "Custom Commands" view.
First, you'll be prompted to enter the shell command you want to save (e.g., git status, npm run dev, echo Hello World).
Next, you'll have the option to provide a display name for your command (e.g., "Git Status", "Start Dev Server"). If you leave this empty, the command itself will be used as the label in the list.

3. **Edit a Command**:
Simply click on any command in the "Custom Commands" view.
It will open in a new editor tab. Make your changes to the shell command content.
Save the file (Ctrl+S / Cmd+S) to apply your modifications.

4. **Run a Command**:

Right-click on any command in the "Custom Commands" view.
Select "Run Command" from the context menu. A confirmation prompt will appear before execution in the integrated terminal.

5. **Rename a Command**:

Right-click on the command you wish to rename.
Select "Rename" from the context menu.
Enter the new filename (e.g., New Name.cmd). The part before .cmd will become the new display name for the command.

6. **Duplicate a Command**:
Right-click on the command you want to duplicate.
Select "Duplicate Command" from the context menu.
You'll be prompted to enter a new name for the duplicated command.

7. **Delete a Command**:
Right-click on the command you want to remove.
Select "Delete" from the context menu. Confirm the deletion when prompted.

8. **Import/Export Commands**:
Look for the "Export Commands (JSON)" (cloud-download icon) and "Import Commands (JSON)" (cloud-upload icon) buttons in the title bar of the "Custom Commands" view. Exporting will save all your current commands to a specified JSON file.
Importing will read commands from a selected JSON file and add new ones to your list, intelligently skipping any exact duplicates.

## Installation
This extension is not yet available on the VS Code Marketplace. You can install it locally from a VSIX package:

### Package the extension:
- Ensure you have vsce installed globally: npm install -g vsce
- Navigate to your extension's root directory in your terminal.
- Run vsce package to create the .vsix file (e.g., commands-viewer-0.0.1.vsix).

### Install from VSIX:
- Open VS Code.
- Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X).
- Click on the ... (More Actions) menu in the top right of the Extensions view.
- Select "Install from VSIX...".
- Browse to and select the .vsix file you just created.
- Reload VS Code if prompted.

## Contributing
We welcome contributions! If you have suggestions for improvements, feature requests, or encounter any issues, please feel free to open an issue or submit a pull request on the GitHub repository.