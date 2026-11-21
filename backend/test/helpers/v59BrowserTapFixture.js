// Synthetic TAP transcript for unit verification ONLY; never accepted as live CI evidence on its own.
function browserTap(){
 return `TAP version 13
# Subtest: Login E2E: Chrome, React, HTTP va PostgreSQL
    # Subtest: customer: 390px, bitta so‘rov, mustaqil hisob va kutish vaqti
    ok 1 - customer: 390px, bitta so‘rov, mustaqil hisob va kutish vaqti
    # Subtest: barber: 1440px, bitta so‘rov, mustaqil hisob va kutish vaqti
    ok 2 - barber: 1440px, bitta so‘rov, mustaqil hisob va kutish vaqti
    # Subtest: admin: takroriy bosish bitta so‘rov, 5-xatoda bir daqiqa va muddatdan keyin kirish
    ok 3 - admin: takroriy bosish bitta so‘rov, 5-xatoda bir daqiqa va muddatdan keyin kirish
    1..3
ok 1 - Login E2E: Chrome, React, HTTP va PostgreSQL
1..1
# tests 4
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
`;
}
module.exports={browserTap};
