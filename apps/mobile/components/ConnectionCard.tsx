import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { ConnectionRow } from "../lib/types";

function getCta(connection: ConnectionRow | null | undefined): string {
  if (!connection) return "Connect";
  switch (connection.status) {
    case "active":
      return "Connected";
    case "pending_config":
      return "Finish setup";
    case "expired":
    case "revoked":
      return "Reconnect";
    default:
      return "Connect";
  }
}

interface ConnectionCardProps {
  connection?: ConnectionRow | null;
  provider: string;
  onConnect: () => void;
}

export function ConnectionCard({ connection, provider, onConnect }: ConnectionCardProps) {
  const cta = getCta(connection);
  const isConnected = connection?.status === "active";

  return (
    <View style={styles.card}>
      <Text style={styles.provider}>{provider}</Text>
      <TouchableOpacity
        style={[styles.button, isConnected && styles.buttonConnected]}
        onPress={onConnect}
        disabled={isConnected}
      >
        <Text style={[styles.buttonText, isConnected && styles.buttonTextConnected]}>
          {cta}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  provider: {
    fontSize: 15,
    fontWeight: "600",
    textTransform: "capitalize",
    flex: 1,
  },
  button: {
    backgroundColor: "#3498db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  buttonConnected: {
    backgroundColor: "#e8f5e9",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonTextConnected: {
    color: "#2e7d32",
  },
});
