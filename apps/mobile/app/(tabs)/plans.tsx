import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { usePlans } from "../../lib/data";
import { PlanListItem } from "../../components/PlanListItem";
import type { PlanWithSync } from "../../lib/types";

type Section = { title: string; data: PlanWithSync[] };

export default function Plans() {
  const { data: plans, loading } = usePlans();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const pending = plans.filter((p) => p.status === "pending");
  const completed = plans.filter((p) => p.status === "completed");
  const missed = plans.filter((p) => p.status === "missed");

  const sections: Section[] = [
    ...(pending.length > 0 ? [{ title: "Upcoming", data: pending }] : []),
    ...(completed.length > 0 ? [{ title: "Completed", data: completed }] : []),
    ...(missed.length > 0 ? [{ title: "Missed", data: missed }] : []),
  ];

  return (
    <View style={styles.container}>
      <SectionList<PlanWithSync, Section>
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PlanListItem plan={item} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No plans yet.</Text>
          </View>
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/plan/new")}
      >
        <Text style={styles.fabText}>New plan</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: {
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.6,
  },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 15, opacity: 0.6 },
  fab: {
    margin: 16,
    backgroundColor: "#3498db",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
