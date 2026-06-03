import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useConnections } from "../../lib/data";
import { useSession, signInWithStrava, connect } from "../../lib/auth";
import { ConnectionCard } from "../../components/ConnectionCard";
import { supabase, functionsBaseUrl } from "../../lib/supabase";
import * as WebBrowser from "expo-web-browser";

// The three providers we render connection cards for.
const PROVIDERS = ["strava", "google_calendar", "notion"] as const;
type Provider = typeof PROVIDERS[number];

function makeAuthDeps(session: { access_token: string } | null) {
  return {
    openAuthSession: (url: string, redirect: string) =>
      WebBrowser.openAuthSessionAsync(url, redirect),
    fetchImpl: fetch,
    setSession: async (tokens: { access_token: string; refresh_token: string }) => {
      await supabase.auth.setSession(tokens);
    },
    functionsBaseUrl: functionsBaseUrl(),
    redirectScheme: "logged://oauth/callback",
  };
}

export default function Settings() {
  const { data: connections, loading } = useConnections();
  const { session } = useSession();

  function handleConnect(provider: Provider) {
    const deps = makeAuthDeps(session);

    if (provider === "strava") {
      signInWithStrava(deps).catch((err: unknown) => {
        Alert.alert("Error", String(err));
      });
      return;
    }

    // For google_calendar and notion: we pass the current access token so the
    // edge function can identify the user.
    // DEFERRED: If session is null (not authenticated yet), the connect flow
    // will fail server-side. The live token is obtained from the session object.
    const accessToken = session?.access_token ?? "";
    connect(provider, accessToken, deps).catch((err: unknown) => {
      Alert.alert("Error", String(err));
    });
  }

  // Stub handler for "Import full history" — actual trigger is server-side (deferred).
  function handleImportHistory() {
    Alert.alert(
      "Import full history",
      "This feature is coming soon. The backend trigger is not yet wired."
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Connections</Text>
      {PROVIDERS.map((provider) => {
        const connection = connections.find((c) => c.provider === provider) ?? null;
        return (
          <ConnectionCard
            key={provider}
            provider={provider}
            connection={connection}
            onConnect={() => handleConnect(provider)}
          />
        );
      })}

      <Text style={styles.sectionTitle}>Data</Text>
      <TouchableOpacity style={styles.importButton} onPress={handleImportHistory}>
        <Text style={styles.importButtonText}>Import full history</Text>
      </TouchableOpacity>
      <Text style={styles.importNote}>
        Imports all historical Strava activities. Backend trigger deferred — see DEFERRED.md.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  importButton: {
    borderWidth: 1,
    borderColor: "#3498db",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
  },
  importButtonText: {
    color: "#3498db",
    fontSize: 15,
    fontWeight: "600",
  },
  importNote: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 6,
  },
});
