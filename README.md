# Bun Test Explorer for VS Code

Run your Bun tests in the built-in VS Code Testing UI.

## Migration to VS Code Native Testing API

This extension has been updated to use VS Code's native Testing API instead of the deprecated Test Explorer extension. This change offers several benefits:

- Better integration with VS Code's built-in testing features
- Improved performance
- Access to richer test result displays and diffs
- No need for additional extension dependencies

### Requirements

- VS Code 1.59 or higher
- Bun 1.0 or higher

### Using the Test Explorer

- Open a project that uses Bun for testing
- Tests will be automatically discovered and displayed in the Testing sidebar
- Click the play button next to a test or test suite to run it
- You can also debug tests by clicking the debug icon

## Features

- Automatic test discovery for Bun tests
- Run/Debug individual tests or test suites
- View test results directly in the editor
- Filter tests by status or name
- Test navigation
- Support for skipped tests (via `it.skip()` or `test.skip()`)

### Skipping Tests

You can skip tests in your Bun test files using standard Bun testing syntax:

```typescript
// Skip an individual test
it.skip("should be skipped", () => {
  // This test will be shown as skipped in the test explorer
});

// Skip a test in a describe block
describe("test suite", () => {
  test.skip("should be skipped", () => {
    // This test will be shown as skipped in the test explorer
  });
});
```

Skipped tests will be properly displayed in the VS Code test explorer with the "skipped" status.

## Configuration

- `bunTestExplorer.pathToBun`: Override the path to the Bun executable
- `bunTestExplorer.pathToBunConfig`: Override the path to the Bun config file
- `bunTestExplorer.logpanel`: Enable/disable diagnostic log output panel
- `bunTestExplorer.logfile`: Path to write diagnostic logs

## License

This extension is licensed under the [MIT License](LICENSE).
# vscode-bun-test-explorer
