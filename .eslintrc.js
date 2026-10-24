module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['coverage/', '.artifacts/', '**/build/'],
  overrides: [
    // Bit masks are the wire format of the Bluetooth packet.
    {
      files: ['src/airpods.ts', '__tests__/airpods.test.ts'],
      rules: { 'no-bitwise': 'off' },
    },
  ],
};
