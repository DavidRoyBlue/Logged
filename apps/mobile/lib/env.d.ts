// Type declarations for Expo public environment variables.
// Expo replaces process.env.EXPO_PUBLIC_* at build time via babel-preset-expo.
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    [key: string]: string | undefined;
  };
};
