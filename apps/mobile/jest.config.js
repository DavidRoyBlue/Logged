module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest-setup.ts"],
  transformIgnorePatterns: [
    // Two-part pattern to handle both hoisted node_modules and pnpm virtual store paths.
    // pnpm stores packages at node_modules/.pnpm/<pkg@ver>/node_modules/<pkg>, so we need
    // two alternations: one for regular node_modules, one for the inner .pnpm store paths.
    "node_modules/(?!.pnpm/)(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/|expo-router|@react-navigation/))|node_modules/.pnpm/[^/]+/node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/|expo-router|@react-navigation/))",
  ],
};
