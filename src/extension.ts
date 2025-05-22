import * as vscode from 'vscode';
import { CommandFileSystemProvider, commandFsScheme } from './commandFs';
import * as fs from 'fs'; // Node.js file system module
import * as path from 'path'; // Node.js path module

// Defines the structure for a command item stored in global state
export interface CommandItem {
    name?: string;    // Display name of the command (optional)
    command: string; // The shell command to execute
}

/**
 * Represents a single command file in the Tree View.
 * Clicking it will open the virtual file in an editor.
 */
class CommandNode extends vscode.TreeItem {
    constructor(
        public readonly item: CommandItem,
        public readonly fileName: string // Store the actual filename used by the FS provider
    ) {
        // Use the optional name, or fallback to the command itself for display
        const label = item.name && item.name.trim() !== '' ? item.name : item.command;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = item.command; // Show the command string as a tooltip
        this.description = item.name ? item.command : undefined; // Display command as description only if name exists

        this.iconPath = new vscode.ThemeIcon('terminal'); // A terminal icon
        this.contextValue = 'commandItem';

        // When clicked, open the virtual file in an editor
        this.command = {
            command: 'vscode.open',
            title: 'Open Command',
            arguments: [vscode.Uri.parse(`${commandFsScheme}:/${fileName}`)]
        };
    }
}

/**
 * Provides data to the 'commandsViewer' Tree View.
 * It now works in conjunction with CommandFileSystemProvider.
 */
export class CommandsProvider implements vscode.TreeDataProvider<CommandNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommandNode | undefined | null | void> = new vscode.EventEmitter<CommandNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommandNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private _commandFsProvider: CommandFileSystemProvider;

    constructor(context: vscode.ExtensionContext, commandFsProvider: CommandFileSystemProvider) {
        this._commandFsProvider = commandFsProvider;
        // Listen to file system changes to refresh the tree view
        this._commandFsProvider.onDidChangeFile(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CommandNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommandNode): Thenable<CommandNode[]> {
        if (element) {
            return Promise.resolve([]); // No children for individual command nodes
        }

        const allCommands = this._commandFsProvider.getAllCommandItems();
        const nodes = allCommands.map(item => {
            // Reconstruct the filename based on the logic in commandFs.ts for display
            // This logic should ideally be centralized or the FS provider should return the actual filename.
            const fileName = item.name && item.name.trim() !== '' ? `${item.name}.cmd` : `${item.command.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}.cmd`;
            return new CommandNode(item, fileName);
        });
        return Promise.resolve(nodes);
    }

    // --- Commands to be registered ---

    async createNewCommand(): Promise<void> {
        const commandContent = await vscode.window.showInputBox({
            prompt: 'Enter the shell command you want to save'
        });
        if (commandContent === undefined) { return; } // User cancelled

        const name = await vscode.window.showInputBox({
            prompt: 'Optional: Enter a display name for this command (e.g., "Run Build")',
            placeHolder: 'Leave empty to use the command itself as name'
        });

        // Use the file system provider to add the command
        await this._commandFsProvider.addCommandItem({ name: name || undefined, command: commandContent });
        this.refresh(); // Refresh the tree view
    }

    async duplicateCommand(node: CommandNode): Promise<void> {
        const originalItem = node.item;
        const newName = await vscode.window.showInputBox({
            prompt: `Enter a new name for the duplicated command (original: "${originalItem.name || originalItem.command}")`,
            value: `${originalItem.name ? originalItem.name + ' (Copy)' : 'Copy of ' + originalItem.command}` // Pre-fill with a suggestion
        });

        if (newName === undefined) { return; }

        await this._commandFsProvider.addCommandItem({
            name: newName,
            command: originalItem.command // Duplicate the command content
        });
        this.refresh();
    }

    async removeCommand(node: CommandNode): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${node.item.name || node.item.command}"?`,
            { modal: true },
            'Yes'
        );

        if (confirmation === 'Yes') {
            const uri = vscode.Uri.parse(`${commandFsScheme}:/${node.fileName}`);
            await this._commandFsProvider.delete(uri, { recursive: false });
            this.refresh();
        }
    }

    async runCommand(node: CommandNode): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            `Run "${node.item.name || node.item.command}"?`,
            { modal: true },
            'Yes'
        );

        if (confirmation === 'Yes') {
            let terminal = vscode.window.activeTerminal;
            if (!terminal) {
                terminal = vscode.window.createTerminal(`Command: ${node.item.name || node.item.command.substring(0, 30)}`);
            }
            terminal.show();
            terminal.sendText(node.item.command);
        }
    }

    async exportCommands(): Promise<void> {
        const commandsToExport = this._commandFsProvider.getAllCommandItems();
        if (commandsToExport.length === 0) {
            vscode.window.showInformationMessage('No commands to export.');
            return;
        }

        const defaultFileName = `my-commands-${new Date().toISOString().slice(0, 10)}.json`;
        const defaultUri = vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', defaultFileName));

        try {
            const uri = await vscode.window.showSaveDialog({
                title: 'Export Commands to JSON',
                defaultUri: defaultUri,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (uri) {
                const jsonString = JSON.stringify(commandsToExport, null, 2);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonString, 'utf8'));
                vscode.window.showInformationMessage(`Commands exported successfully to ${uri.fsPath}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to export commands: ${error.message}`);
            console.error('Export commands error:', error);
        }
    }

    async importCommands(): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                title: 'Import Commands from JSON',
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (uri && uri.length > 0) {
                const fileContent = await vscode.workspace.fs.readFile(uri[0]);
                const jsonString = Buffer.from(fileContent).toString('utf8');
                let importedCommands: CommandItem[] = [];

                try {
                    importedCommands = JSON.parse(jsonString);
                    // Basic validation to ensure it's an array of CommandItem like objects
                    if (!Array.isArray(importedCommands) || !importedCommands.every(cmd => typeof cmd === 'object' && typeof cmd.command === 'string')) {
                        throw new Error('Invalid JSON format. Expected an array of objects with a "command" property.');
                    }
                } catch (jsonError: any) {
                    vscode.window.showErrorMessage(`Invalid JSON file: ${jsonError.message}`);
                    return;
                }

                if (importedCommands.length === 0) {
                    vscode.window.showInformationMessage('No commands found in the selected file.');
                    return;
                }

                const currentCommands = this._commandFsProvider.getAllCommandItems();
                const newCommands: CommandItem[] = [];
                let commandsAdded = 0;

                for (const importedCmd of importedCommands) {
                    // Check for exact duplicates (same name and command) before adding
                    const isDuplicate = currentCommands.some(
                        existingCmd => existingCmd.name === importedCmd.name && existingCmd.command === importedCmd.command
                    );

                    if (!isDuplicate) {
                        newCommands.push(importedCmd);
                        commandsAdded++;
                    } else {
                        console.log(`Skipping duplicate command: ${importedCmd.name || importedCmd.command}`);
                    }
                }

                if (newCommands.length > 0) {
                    // Add new commands through the file system provider
                    for (const cmd of newCommands) {
                        await this._commandFsProvider.addCommandItem(cmd);
                    }
                    this.refresh();
                    vscode.window.showInformationMessage(`Successfully imported ${commandsAdded} new commands.`);
                } else {
                    vscode.window.showInformationMessage('No new commands were imported (all were duplicates or file was empty).');
                }

            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to import commands: ${error.message}`);
            console.error('Import commands error:', error);
        }
    }
}

/**
 * Activates the extension.
 * @param context The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext) {
    const commandFsProvider = new CommandFileSystemProvider(context);
    vscode.workspace.registerFileSystemProvider(commandFsScheme, commandFsProvider, {
        // Options like `isCaseSensitive` can be added if needed
    });

    const commandsProvider = new CommandsProvider(context, commandFsProvider);

    vscode.window.registerTreeDataProvider('commandsViewer', commandsProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('commandsViewer.createNewCommand', () => commandsProvider.createNewCommand()),
        vscode.commands.registerCommand('commandsViewer.duplicateCommand', (node: CommandNode) => commandsProvider.duplicateCommand(node)),
        vscode.commands.registerCommand('commandsViewer.removeCommand', (node: CommandNode) => commandsProvider.removeCommand(node)),
        vscode.commands.registerCommand('commandsViewer.runCommand', (node: CommandNode) => commandsProvider.runCommand(node)),
        vscode.commands.registerCommand('commandsViewer.refreshEntry', () => commandsProvider.refresh()),
        vscode.commands.registerCommand('commandsViewer.exportCommands', () => commandsProvider.exportCommands()), // New export command
        vscode.commands.registerCommand('commandsViewer.importCommands', () => commandsProvider.importCommands())  // New import command
    );
}

export function deactivate() { }