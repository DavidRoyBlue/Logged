import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function NewPlan() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Run");
  const [plannedDate, setPlannedDate] = useState("");
  const [targetDistanceKm, setTargetDistanceKm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required.");
      return;
    }
    if (!plannedDate.trim()) {
      Alert.alert("Validation", "Planned date is required (YYYY-MM-DD).");
      return;
    }

    setSubmitting(true);
    const targetDistanceM =
      targetDistanceKm.trim()
        ? Math.round(parseFloat(targetDistanceKm) * 1000)
        : null;

    const { error } = await supabase.from("planned_sessions").insert({
      title: title.trim(),
      type: type.trim() || "Run",
      planned_date: plannedDate.trim(),
      target_distance_m: targetDistanceM,
      status: "pending",
    });

    setSubmitting(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    router.back();
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>New Plan</Text>

      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Easy 5k"
        returnKeyType="next"
      />

      <Text style={styles.label}>Type</Text>
      <TextInput
        style={styles.input}
        value={type}
        onChangeText={setType}
        placeholder="Run"
        returnKeyType="next"
      />

      <Text style={styles.label}>Planned date * (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={plannedDate}
        onChangeText={setPlannedDate}
        placeholder="2024-06-15"
        returnKeyType="next"
        autoCapitalize="none"
      />

      <Text style={styles.label}>Target distance (km)</Text>
      <TextInput
        style={styles.input}
        value={targetDistanceKm}
        onChangeText={setTargetDistanceKm}
        placeholder="10"
        keyboardType="decimal-pad"
        returnKeyType="done"
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save plan</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    marginTop: 24,
    backgroundColor: "#3498db",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
