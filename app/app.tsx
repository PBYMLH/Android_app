import React, { useCallback, useState } from "react";
import { SafeAreaView, View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from "react-native";
import DocumentPicker from "react-native-document-picker";
import RNFS from "react-native-fs";
import { FFmpegKit, ReturnCode } from "ffmpeg-kit-react-native";



const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const outDir = RNFS.DocumentDirectoryPath + "/outputs";


async function ensureOutDir() {
  const exists = await RNFS.exists(outDir);
  if (!exists) await RNFS.mkdir(outDir);
  return outDir;
}


async function pickVideo() {
  const file = await DocumentPicker.pickSingle({ type: DocumentPicker.types.video });
  return file.uri; // content:// or file:// — FFmpegKit supports both
}


async function runFFmpeg(cmd: string) {
  return new Promise<{ ok: boolean; logs: string }>((resolve) => {
    FFmpegKit.executeAsync(cmd, async (session) => {
      const returnCode = await session.getReturnCode();
      const logs = (await session.getAllLogsAsString?.()) || "";
      resolve({ ok: ReturnCode.isSuccess(returnCode), logs });
    });
  });
}


function buildSplitCommand(inputUri: string, outPattern: string) {
  return `-i "${inputUri}" -map 0 -c:v libx264 -preset veryfast -crf 23 -c:a aac -segment_time 60 -f segment -reset_timestamps 1 "${outPattern}"`;
}


function buildCropSquareCommand(inputUri: string, outputPath: string) {
  const vf = "crop='min(iw,ih)':'min(iw,ih)',scale=1080:1080";
  return `-i "${inputUri}" -vf ${vf} -c:v libx264 -preset veryfast -crf 20 -c:a copy "${outputPath}"`;
}


function buildBlurCommand(inputUri: string, outputPath: string) {
  const vf = "boxblur=10:1";
  return `-i "${inputUri}" -vf ${vf} -c:v libx264 -preset veryfast -crf 22 -c:a copy "${outputPath}"`;
}


function buildEnhanceCommand(inputUri: string, outputPath: string) {
  const vf = "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.08:brightness=0.02:saturation=1.15";
  return `-i "${inputUri}" -vf ${vf} -c:v libx264 -preset veryfast -crf 20 -c:a copy "${outputPath}"`;
}


export default function App() {
  const [inputUri, setInputUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);


  const onPick = useCallback(async () => {
    try {
      const uri = await pickVideo();
      setInputUri(uri);
      Alert.alert("Video selected", uri);
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) Alert.alert("Pick failed", String(e?.message || e));
    }
  }, []);


  const withRun = useCallback(
    async (label: string, buildCmd: () => Promise<string> | string) => {
      if (!inputUri) return Alert.alert("No video", "Please pick a video first.");
      try {
        setBusy(label);
        await ensureOutDir();
        const cmd = await buildCmd();
        const r = await runFFmpeg(cmd);
        setBusy(null);
        if (r.ok) Alert.alert(`${label} done`, "Check the output paths below.");
        else Alert.alert(`${label} failed`, r.logs.slice(0, 2000));
      } catch (err: any) {
        setBusy(null);
        Alert.alert(`${label} error`, String(err?.message || err));
      }
    },
    [inputUri]
  );


  const doSplit = useCallback(
    () =>
      withRun("Split (1-minute)", async () => {
        const pattern = `${outDir}/split_${nowStamp()}_%03d.mp4`;
        setOutputs((o) => [pattern.replace("%03d", "001.."), ...o]);
        return buildSplitCommand(inputUri!, pattern);
      }),
    [inputUri]
  );


  const doCrop = useCallback(
    () =>
      withRun("Crop (Square)", async () => {
        const out = `${outDir}/crop_${nowStamp()}.mp4`;
        setOutputs((o) => [out, ...o]);
        return buildCropSquareCommand(inputUri!, out);
      }),
    [inputUri]
  );


  const doBlur = useCallback(
    () =>
      withRun("Blur", async () => {
        const out = `${outDir}/blur_${nowStamp()}.mp4`;
        setOutputs((o) => [out, ...o]);
        return buildBlurCommand(inputUri!, out);
      }),
    [inputUri]
  );


  const doEnhance = useCallback(
    () =>
      withRun("Enhance", async () => {
        const out = `${outDir}/enhance_${nowStamp()}.mp4`;
        setOutputs((o) => [out, ...o]);
        return buildEnhanceCommand(inputUri!, out);
      }),
    [inputUri]
  );


  const Row = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>{children}</View>
  );


  const Btn = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#4f46e5", borderRadius: 16 }}>
      <Text style={{ color: "white", fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "800", marginBottom: 8 }}>Offline Video Editor</Text>
        <Text style={{ color: "#cbd5e1", marginBottom: 16 }}>Pick a video, then choose an action. 100% on-device.</Text>


        <Row>
          <Btn label={inputUri ? "Change Video" : "Pick Video"} onPress={onPick} />
        </Row>


        <Row>
          <Btn label="Split → 1-min clips" onPress={doSplit} disabled={!inputUri || !!busy} />
        </Row>


        <Row>
          <Btn label="Crop (Square)" onPress={doCrop} disabled={!inputUri || !!busy} />
          <Btn label="Blur" onPress={doBlur} disabled={!inputUri || !!busy} />
          <Btn label="Enhance" onPress={doEnhance} disabled={!inputUri || !!busy} />
        </Row>


        {busy && (
          <View style={{ marginTop: 16, padding: 12, backgroundColor: "#27272a", borderRadius: 16, flexDirection: "row", alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: "white", marginLeft: 8 }}>{busy}… working</Text>
          </View>
        )}


        <Text style={{ color: "white", fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 8 }}>Outputs</Text>
        {outputs.length === 0 ? (
          <Text style={{ color: "#a1a1aa" }}>Nothing yet. After you run an action, file paths appear here.</Text>
        ) : (
          outputs.map((p) => (
            <View key={p} style={{ marginBottom: 8, padding: 12, backgroundColor: "#27272a", borderRadius: 12 }}>
              <Text style={{ color: "#e4e4e7" }}>{p}</Text>
            </View>
          ))
        )}


        <Text style={{ color: "#a1a1aa", marginTop: 24 }}>
          Files save to the app’s Documents folder. You can share them from other apps.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}