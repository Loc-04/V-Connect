import { StyleSheet, View } from 'react-native';

export function ScannerFrameOverlay() {
  return (
    <View pointerEvents="none" style={styles.frame}>
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: 'rgba(255, 255, 255, 0.36)',
    borderRadius: 8,
    borderWidth: 1,
    height: 280,
    position: 'relative',
    width: 280,
  },
  corner: {
    borderColor: '#07B5FF',
    borderWidth: 4,
    height: 34,
    position: 'absolute',
    width: 34,
  },
  topLeft: {
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 10,
    left: 8,
    top: 8,
  },
  topRight: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 10,
    right: 8,
    top: 8,
  },
  bottomLeft: {
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    bottom: 8,
    left: 8,
  },
  bottomRight: {
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 10,
    bottom: 8,
    right: 8,
  },
});
