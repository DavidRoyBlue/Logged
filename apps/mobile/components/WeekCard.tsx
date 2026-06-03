import { View, Text, StyleSheet } from "react-native";
import type { WeekSummary } from "../lib/types";

function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function formatDuration(movingTimeS: number): string {
  const totalMinutes = Math.floor(movingTimeS / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatDelta(deltaDistancePct: number | null): string {
  if (deltaDistancePct === null) return "—";
  const sign = deltaDistancePct >= 0 ? "+" : "";
  return `${sign}${deltaDistancePct.toFixed(1)}%`;
}

interface WeekCardProps {
  summary: WeekSummary;
}

export function WeekCard({ summary }: WeekCardProps) {
  const { distanceM, movingTimeS, count, deltaDistancePct } = summary;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>This week</Text>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.value}>{formatDistance(distanceM)}</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.value}>{formatDuration(movingTimeS)}</Text>
          <Text style={styles.statLabel}>Time</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.value}>{count}</Text>
          <Text style={styles.statLabel}>Activities</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.value}>{formatDelta(deltaDistancePct)}</Text>
          <Text style={styles.statLabel}>vs last week</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.6,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
  },
});
