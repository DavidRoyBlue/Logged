import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { ActivityRow } from "../lib/types";

function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function formatPace(avgPaceSPerKm: number): string {
  const minutes = Math.floor(avgPaceSPerKm / 60);
  const seconds = avgPaceSPerKm % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatDate(isoString: string): string {
  return isoString.slice(0, 10);
}

function getDisplayName(activity: ActivityRow): string {
  if (activity.name) return activity.name;
  const km = (activity.distance_m / 1000).toFixed(1);
  return `${activity.type} ${km}k`;
}

interface ActivityListItemProps {
  activity: ActivityRow;
  matched?: boolean;
  onPress?: () => void;
}

function ActivityListItemContent({ activity, matched }: { activity: ActivityRow; matched?: boolean }) {
  const isRace = activity.workout_type === 1;
  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{getDisplayName(activity)}</Text>
        <View style={styles.badges}>
          {isRace && (
            <View style={styles.raceBadge}>
              <Text style={styles.raceBadgeText}>RACE</Text>
            </View>
          )}
          {matched && <Text style={styles.matchedIcon}>✅</Text>}
        </View>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detail}>{formatDate(activity.start_time)}</Text>
        <Text style={styles.detail}>{formatDistance(activity.distance_m)}</Text>
        {activity.avg_pace_s_per_km !== null && (
          <Text style={styles.detail}>{formatPace(activity.avg_pace_s_per_km)}</Text>
        )}
      </View>
    </>
  );
}

export function ActivityListItem({ activity, matched, onPress }: ActivityListItemProps) {
  if (onPress) {
    return (
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <ActivityListItemContent activity={activity} matched={matched} />
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.container}>
      <ActivityListItemContent activity={activity} matched={matched} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  raceBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  raceBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  matchedIcon: {
    fontSize: 14,
  },
  detailRow: {
    flexDirection: "row",
    gap: 12,
  },
  detail: {
    fontSize: 13,
    opacity: 0.7,
  },
});
