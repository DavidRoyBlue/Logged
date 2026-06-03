import { View, Text, StyleSheet } from "react-native";
import type { PlanWithSync } from "../lib/types";

interface PlanListItemProps {
  plan: PlanWithSync;
}

export function PlanListItem({ plan }: PlanListItemProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{plan.title}</Text>
        <View style={styles.badges}>
          {plan.calendarSynced && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Cal</Text>
            </View>
          )}
          {plan.notionSynced && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Notion</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detail}>{plan.planned_date}</Text>
        <Text style={styles.status}>{plan.status}</Text>
      </View>
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
  title: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    backgroundColor: "#3498db",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    gap: 12,
  },
  detail: {
    fontSize: 13,
    opacity: 0.7,
  },
  status: {
    fontSize: 13,
    opacity: 0.7,
  },
});
