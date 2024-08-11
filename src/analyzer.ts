import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

export class CodebaseAnalyzer {
  private files: string[] = [];

  constructor(private rootDir: string) {}

  // Collect all TypeScript files in the project directory
  public collectFiles(): void {
    const collect = (dir: string) => {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const fullPath = path.join(dir, file);

        // Skip node_modules and other directories you want to exclude
        if (fs.statSync(fullPath).isDirectory()) {
          if (file === "node_modules") {
            return;
          }
          collect(fullPath);
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          this.files.push(fullPath);
        }
      });
    };
    collect(this.rootDir);
  }

  // Analyze the codebase to create an AST for each file
  public analyze(): ts.SourceFile[] {
    const sourceFiles: ts.SourceFile[] = [];
    this.files.forEach((file) => {
      const sourceCode = fs.readFileSync(file, "utf-8");
      const sourceFile = ts.createSourceFile(
        file,
        sourceCode,
        ts.ScriptTarget.Latest
      );
      sourceFiles.push(sourceFile);
    });
    return sourceFiles;
  }

  // Example: Find all functions without documentation
  public findUndocumentedFunctions(sourceFiles: ts.SourceFile[]): string[] {
    const undocumentedFunctions: string[] = [];

    sourceFiles.forEach((sourceFile) => {
      ts.forEachChild(sourceFile, (node) => {
        try {
          if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
            const jsDocTags = ts.getJSDocTags(node);
            const hasJsDoc = jsDocTags && jsDocTags.length > 0;

            let name = "Anonymous Function";
            if (node.name) {
              name = node.name.getText();
            } else {
              console.warn(
                `Node type ${node.kind} without a name in ${sourceFile.fileName}`
              );
            }

            if (!hasJsDoc) {
              undocumentedFunctions.push(`${name} in ${sourceFile.fileName}`);
            }
          } else {
            console.log(
              `Unhandled node type: ${node.kind} in ${sourceFile.fileName}`
            );
          }
        } catch (error) {
          console.error(
            `Error processing node: ${node.kind} in ${sourceFile.fileName}`
          );
          console.error(error);
        }
      });
    });

    return undocumentedFunctions;
  }

  // Find all classes in the codebase
  public findAllClasses(sourceFiles: ts.SourceFile[]): string[] {
    const classes: string[] = [];

    sourceFiles.forEach((sourceFile) => {
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isClassDeclaration(node) && node.name) {
          classes.push(node.name.getText());
        }
      });
    });

    return classes;
  }
}
