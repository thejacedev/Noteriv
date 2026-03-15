import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useApp } from '@/context/AppContext';
import { parseSlides, Slide } from '@/lib/slide-utils';
import MarkdownPreview from '@/components/MarkdownPreview';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SlidesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { content, settings } = useApp();

  const slides = useMemo(() => parseSlides(content), [content]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  }, [currentIndex, slides.length]);

  const styles = makeStyles(colors);

  const renderSlide = useCallback(
    ({ item }: { item: Slide }) => (
      <View style={styles.slide}>
        <MarkdownPreview content={item.content} fontSize={settings.fontSize + 4} />
      </View>
    ),
    [styles.slide, settings.fontSize]
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Close button */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.counter}>
            {currentIndex + 1} / {slides.length}
          </Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(_, index) => String(index)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />

        {/* Navigation arrows */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
            onPress={goToPrev}
            disabled={currentIndex === 0}
          >
            <Ionicons
              name="chevron-back"
              size={28}
              color={currentIndex === 0 ? colors.textMuted : colors.textPrimary}
            />
          </TouchableOpacity>

          {/* Progress dots */}
          <View style={styles.dotsContainer}>
            {slides.length <= 20 &&
              slides.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i === currentIndex ? colors.accent : colors.bgTertiary,
                    },
                  ]}
                />
              ))}
          </View>

          <TouchableOpacity
            style={[
              styles.navBtn,
              currentIndex === slides.length - 1 && styles.navBtnDisabled,
            ]}
            onPress={goToNext}
            disabled={currentIndex === slides.length - 1}
          >
            <Ionicons
              name="chevron-forward"
              size={28}
              color={
                currentIndex === slides.length - 1
                  ? colors.textMuted
                  : colors.textPrimary
              }
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },
    safeArea: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 22,
    },
    counter: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    slide: {
      width: SCREEN_WIDTH,
      flex: 1,
      paddingHorizontal: 8,
    },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    navBtn: {
      width: 48,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 24,
      backgroundColor: colors.bgSecondary,
    },
    navBtnDisabled: {
      opacity: 0.4,
    },
    dotsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });
}
