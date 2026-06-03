import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useActivities } from "../../lib/data";
import { ActivityListItem } from "../../components/ActivityListItem";
import type { ActivityRow } from "../../lib/types";

export default function Activities() {
  const { data: activities, loading } = useActivities();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList<ActivityRow>
      style={styles.list}
      data={activities}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ActivityListItem
          activity={item}
          matched={false}
          onPress={() => router.push(`/activity/${item.id}`)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
