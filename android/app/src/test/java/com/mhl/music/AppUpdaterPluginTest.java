package com.mhl.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class AppUpdaterPluginTest {

    @Test
    public void acceptsWholeNumbersFromCapacitorJson() {
        assertEquals(Long.valueOf(155520962L), AppUpdaterPlugin.coerceWholeNumber(155520962));
        assertEquals(Long.valueOf(1781474048000L), AppUpdaterPlugin.coerceWholeNumber(1781474048000L));
        assertEquals(Long.valueOf(21L), AppUpdaterPlugin.coerceWholeNumber(21.0));
    }

    @Test
    public void rejectsMissingOrNonWholeValues() {
        assertNull(AppUpdaterPlugin.coerceWholeNumber(null));
        assertNull(AppUpdaterPlugin.coerceWholeNumber("21"));
        assertNull(AppUpdaterPlugin.coerceWholeNumber(21.5));
        assertNull(AppUpdaterPlugin.coerceWholeNumber(Double.NaN));
    }
}
