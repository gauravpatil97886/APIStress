// Package security holds defence-in-depth helpers shared across all tools.
//
// SSRF gate
// ─────────
// Both Kavach (the VAPT scanner) and APIStress (the load tester) accept
// user-supplied URLs and fire HTTP requests at them. An operator with a
// valid team key could otherwise pivot off our backend into the internal
// network — hitting cloud-metadata endpoints (169.254.169.254), services
// bound to loopback, or RFC1918 LAN ranges that aren't reachable from
// outside the cluster but are reachable from the backend host.
//
// `IsBlockedHost` returns true for any hostname or address that resolves
// to a loopback, link-local, multicast, RFC1918, or unique-local address.
// Callers are expected to gate their target-URL acceptance on this
// (rejecting outright in Kavach, warning-only in APIStress where load
// testing internal services is a legitimate use case).
package security

import (
	"net"
	"strings"
)

// IsBlockedHost returns true when the supplied host (a hostname OR a
// literal IP, with or without port) resolves to a private / loopback /
// link-local / multicast / unique-local IP that we don't want to be
// reachable from a tenant-supplied target URL.
//
// Resolution failure is treated as "blocked" — better to fail closed than
// to let a `localhost.evil.com` style trick squeeze through.
func IsBlockedHost(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" {
		return true
	}
	// Strip optional port and surrounding brackets for IPv6 literals.
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")

	// Literal IP fast-path.
	if ip := net.ParseIP(host); ip != nil {
		return isBlockedIP(ip)
	}

	// Hostname — resolve all answers; if ANY of them is blocked we treat
	// the whole host as blocked. This stops DNS-rebinding-style tricks
	// where an attacker-controlled name resolves to both a public and a
	// private address.
	addrs, err := net.LookupIP(host)
	if err != nil || len(addrs) == 0 {
		return true
	}
	for _, ip := range addrs {
		if isBlockedIP(ip) {
			return true
		}
	}
	return false
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	// Generic stdlib classifications cover most cases.
	if ip.IsLoopback() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsInterfaceLocalMulticast() {
		return true
	}
	// 169.254.169.254 (cloud metadata) is technically link-local, so the
	// IsLinkLocalUnicast check above catches it. Belt-and-braces:
	if ip.Equal(net.IPv4(169, 254, 169, 254)) {
		return true
	}
	// RFC1918 + carrier-grade NAT (100.64.0.0/10) + IPv6 unique-local (fc00::/7).
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 10:
			return true
		case v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31:
			return true
		case v4[0] == 192 && v4[1] == 168:
			return true
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127:
			return true
		case v4[0] == 127:
			return true
		}
		return false
	}
	// IPv6: unique-local (fc00::/7) + IPv4-mapped that hits a private v4.
	if len(ip) == 16 && (ip[0]&0xfe) == 0xfc {
		return true
	}
	return false
}
