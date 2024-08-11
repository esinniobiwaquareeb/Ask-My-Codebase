# Ask Codebase - VSCode Extension

## Overview

Ask Codebase is a VSCode extension that allows you to interact with your codebase through a chat-like interface. You can ask questions about the structure of your project, such as finding undocumented functions or listing all classes, and receive instant responses.

## Features

- **Codebase Analysis**: Automatically analyze your project to find functions, classes, and more.
- **Interactive Chat Interface**: Ask questions about your codebase, and get structured responses.
- **Integrated with OpenAI (Optional)**: Use OpenAI to provide more advanced code suggestions and interactions.

## Getting Started

### Installation

1. Clone this repository to your local machine.
2. Open the project in VSCode.
3. Run `npm install` to install dependencies.
4. Press `F5` to run the extension in a new VSCode window.

### Setup

1. Upon first activation, you'll be prompted to enter your OpenAI API key. If you don't have one, you can skip this step and use the local analysis features.
2. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and type `Ask Codebase`.
3. The chat interface will open in the sidebar.

### Example Interactions

- **List All Functions**: Type `List all functions` to get a list of all functions in your project.
- **Find Undocumented Functions**: Type `Find undocumented functions` to see which functions are missing documentation.
- **List All Classes**: Type `List all classes` to get a list of all classes in your project.

## Configuration

- **OpenAI API Key**: You can set or update your OpenAI API key by running the `Set OpenAI Key` command from the command palette.

## License

This project is licensed under the MIT License.
