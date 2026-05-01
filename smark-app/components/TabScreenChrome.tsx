import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 与 `TabScreenHeader` 内容行一致；导入等全屏子页顶栏复用以对齐分隔线高度 */
export const tabHeaderRowVerticalLayout = {
  paddingTop: 6,
  paddingBottom: 12,
  minHeight: 48,
} as const;

/** 顶栏内图标区高度，与 `HeaderSearchIconButton`、右侧主按钮所在行视觉对齐；导入页返回键勿用 44 以免撑高整行 */
export const tabHeaderTapTargetSize = 40;

type TabScreenHeaderProps = {
  /** 左侧大标题（与 left 二选一） */
  title?: string;
  /** 自定义左侧（如搜索栏），存在时忽略 title */
  left?: ReactNode;
  right?: ReactNode;
};

export function TabScreenHeader({ title, left, right }: TabScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        {left ? (
          <View style={styles.headerLeftFlex}>{left}</View>
        ) : (
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        )}
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
      <View style={styles.headerDivider} />
    </View>
  );
}

export function HeaderPrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.primaryBtn} accessibilityRole="button">
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function HeaderOverflowButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
      style={styles.overflowBtn}
    >
      <Text style={styles.overflowBtnText}>⋯</Text>
    </Pressable>
  );
}

/** 顶栏右侧：进入 Quick Card 搜索页 */
export function HeaderSearchIconButton({
  onPress,
  label = '搜索 Quick Card',
}: {
  onPress: () => void;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
      style={({ pressed }) => [styles.searchIconBtn, pressed && styles.searchIconBtnPressed]}
    >
      <Ionicons name="search" size={19} color="#374151" />
    </Pressable>
  );
}

/** 与首页 mockup 一致的列表卡片容器 */
export const tabListCard = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardPreview: { marginTop: 8, fontSize: 14, lineHeight: 22, color: '#4b5563' },
  cardMeta: { marginTop: 10, fontSize: 12, color: '#9ca3af' },
});

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: '#fff' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: tabHeaderRowVerticalLayout.paddingTop,
    paddingBottom: tabHeaderRowVerticalLayout.paddingBottom,
    gap: 12,
    minHeight: tabHeaderRowVerticalLayout.minHeight,
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  headerLeftFlex: { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 4 },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
  },
  primaryBtn: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  overflowBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 36,
    alignItems: 'center',
  },
  overflowBtnText: { fontSize: 22, color: '#374151', fontWeight: '700', lineHeight: 24 },
  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  searchIconBtnPressed: { backgroundColor: '#e5e7eb' },
});
