import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { WebView } from 'react-native-webview';
import { listAllMarkdownFiles, readFile } from '@/lib/file-system';

interface GraphNode {
  id: string;
  label: string;
  path: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

export default function GraphScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { vault } = useApp();

  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!vault) return;
    (async () => {
      const files = await listAllMarkdownFiles(vault.path);
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const nameMap = new Map<string, string>(); // lowercase name -> id

      for (const f of files) {
        nodes.push({ id: f.fileName, label: f.fileName, path: f.filePath });
        nameMap.set(f.fileName.toLowerCase(), f.fileName);
      }

      // Find wiki links
      const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      for (const f of files) {
        const content = await readFile(f.filePath);
        if (!content) continue;
        let m;
        wikiRegex.lastIndex = 0;
        const seen = new Set<string>();
        while ((m = wikiRegex.exec(content)) !== null) {
          const target = m[1].trim().toLowerCase();
          const targetId = nameMap.get(target);
          if (targetId && targetId !== f.fileName && !seen.has(targetId)) {
            edges.push({ source: f.fileName, target: targetId });
            seen.add(targetId);
          }
        }
      }

      // Filter to only nodes that have connections
      const connected = new Set<string>();
      for (const e of edges) {
        connected.add(e.source);
        connected.add(e.target);
      }
      const filteredNodes = nodes.filter((n) => connected.has(n.id));

      setHtml(buildGraphHTML(filteredNodes, edges, colors));
      setLoading(false);
    })();
  }, [vault, colors]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'nodeClick' && data.path) {
        router.push({ pathname: '/editor', params: { path: data.path } });
      }
    } catch {}
  }, [router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Graph View</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: colors.textMuted, marginTop: 12 }}>Building graph...</Text>
        </View>
      ) : (
        <WebView
          source={{ html }}
          style={{ backgroundColor: colors.bgPrimary }}
          originWhitelist={['*']}
          onMessage={handleMessage}
          scrollEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

function buildGraphHTML(
  nodes: GraphNode[],
  edges: GraphEdge[],
  colors: ReturnType<typeof useTheme>['colors']
): string {
  const { width, height } = Dimensions.get('window');

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; }
  body { background: ${colors.bgPrimary}; overflow: hidden; touch-action: none; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const W = ${width}, H = ${height - 100};
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');

const nodes = ${JSON.stringify(nodes.map((n, i) => ({
    ...n,
    x: width / 2 + (Math.random() - 0.5) * width * 0.6,
    y: (height - 100) / 2 + (Math.random() - 0.5) * (height - 100) * 0.6,
    vx: 0, vy: 0,
  })))};

const edges = ${JSON.stringify(edges)};
const nodeMap = {};
nodes.forEach(n => nodeMap[n.id] = n);

// Connection count for sizing
const conns = {};
edges.forEach(e => {
  conns[e.source] = (conns[e.source] || 0) + 1;
  conns[e.target] = (conns[e.target] || 0) + 1;
});

function simulate() {
  const k = 0.01;
  const repulsion = 3000;
  const damping = 0.85;
  const centerPull = 0.002;

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      let dx = nodes[j].x - nodes[i].x;
      let dy = nodes[j].y - nodes[i].y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let f = repulsion / (dist * dist);
      let fx = (dx / dist) * f;
      let fy = (dy / dist) * f;
      nodes[i].vx -= fx; nodes[i].vy -= fy;
      nodes[j].vx += fx; nodes[j].vy += fy;
    }
  }

  // Attraction along edges
  for (const e of edges) {
    const a = nodeMap[e.source], b = nodeMap[e.target];
    if (!a || !b) continue;
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let f = (dist - 100) * k;
    let fx = (dx / dist) * f, fy = (dy / dist) * f;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  // Center pull + apply velocity
  for (const n of nodes) {
    n.vx += (W / 2 - n.x) * centerPull;
    n.vy += (H / 2 - n.y) * centerPull;
    n.vx *= damping; n.vy *= damping;
    n.x += n.vx; n.y += n.vy;
    n.x = Math.max(20, Math.min(W - 20, n.x));
    n.y = Math.max(20, Math.min(H - 20, n.y));
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Edges
  ctx.strokeStyle = '${colors.textMuted}44';
  ctx.lineWidth = 1;
  for (const e of edges) {
    const a = nodeMap[e.source], b = nodeMap[e.target];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Nodes
  for (const n of nodes) {
    const c = conns[n.id] || 1;
    const r = Math.min(3 + c * 1.5, 12);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '${colors.accent}';
    ctx.fill();

    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '${colors.textSecondary}';
    ctx.textAlign = 'center';
    ctx.fillText(n.label, n.x, n.y + r + 12);
  }
}

let frames = 0;
function loop() {
  simulate();
  draw();
  frames++;
  if (frames < 300) requestAnimationFrame(loop);
}
loop();

// Tap to navigate
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  for (const n of nodes) {
    const c = conns[n.id] || 1;
    const r = Math.min(3 + c * 1.5, 12) + 10;
    if ((n.x - x) ** 2 + (n.y - y) ** 2 < r * r) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nodeClick', path: n.path }));
      break;
    }
  }
});
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 8, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
