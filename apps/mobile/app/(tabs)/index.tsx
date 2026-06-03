import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useWeekSummary, useActivities, useRealtimeActivities } from "../../lib/data";
import { WeekCard } from "../../components/WeekCard";
import { ActivityListItem } from "../../components/ActivityListItem";
import type { ActivityRow } from "../../lib/types";

export default function Home() {
  const { summary, loading: summaryLoading } = useWeekSummary();
  const { data: activities, loading: activitiesLoading, reload } = useActivities(20);

  // Subscribe to realtime activity inserts and reload the list when a new one arrives.
  useRealtimeActivities(reload);

  if (summaryLoading || activitiesLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList<ActivityRow>
      style={styles.list}
      ListHeaderComponent={<WeekCard summary={summary} />}
      data={activities}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ActivityListItem activity={item} matched={false} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
