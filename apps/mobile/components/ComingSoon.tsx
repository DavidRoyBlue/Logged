import { View, Text, StyleSheet } from "react-native";

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>{feature}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  subtitle: { fontSize: 14, opacity: 0.6 },
});
