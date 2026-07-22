# Gotenberg 8.34 drops linked external content for untrusted office uploads and
# ships Liberation Serif/Sans (metric-compatible with Times New Roman/Arial).
FROM gotenberg/gotenberg:8.34.0-libreoffice

# Fail the image build if a future upstream image loses the required font set.
USER root
RUN fc-match "Liberation Serif" | grep -qi "LiberationSerif" \
    && fc-match "Liberation Sans" | grep -qi "LiberationSans"
USER gotenberg
