import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useActivity } from "../../lib/data";

function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

function formatPace(avgPaceSPerKm: number): string {
  const minutes = Math.floor(avgPaceSPerKm / 60);
  const seconds = avgPaceSPerKm % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatDuration(movingTimeS: number): string {
  const totalMinutes = Math.floor(movingTimeS / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const secs = movingTimeS % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: activity, loading } = useActivity(id);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>Activity not found.</Text>
      </View>
    );
  }

  const isRace = activity.workout_type === 1;
  const displayName =
    activity.name ??
    `${activity.type} ${(activity.distance_m / 1000).toFixed(1)}k`;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{displayName}</Text>
        {isRace && (
          <View style={styles.raceBadge}>
            <Text style={styles.raceBadgeText}>RACE</Text>
          </View>
        )}
      </View>
      <Text style={styles.date}>{activity.start_time.slice(0, 10)}</Text>

      <View style={styles.statsGrid}>
        <StatRow label="Distance" value={formatDistance(activity.distance_m)} />
        {activity.avg_pace_s_per_km !== null && (
          <StatRow label="Pace" value={formatPace(activity.avg_pace_s_per_km)} />
        )}
        <StatRow label="Duration" value={formatDuration(activity.moving_time_s)} />
        {activity.avg_hr !== null && (
          <StatRow label="Avg HR" value={`${activity.avg_hr} bpm`} />
        )}
        {activity.elevation_gain_m !== null && (
          <StatRow label="Elevation" value={`${activity.elevation_gain_m} m`} />
        )}
      </View>
    </ScrollView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16, opacity: 0.6 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  date: { fontSize: 14, opacity: 0.6, marginBottom: 20 },
  raceBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  raceBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  statsGrid: { gap: 12 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    paddingBottom: 8,
  },
  statLabel: { fontSize: 15, opacity: 0.7 },
  statValue: { fontSize: 15, fontWeight: "600" },
});
